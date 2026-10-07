import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import https from "node:https";

const args = process.argv.slice(2);
const target = new URL(args[0] || "https://invalid.example");
const originIndex = args.indexOf("--origin");
const origin = originIndex >= 0 ? args[originIndex + 1] : "http://127.0.0.1:4173";
if (target.protocol !== "wss:" || target.username || target.password || target.hash || target.search) {
  throw new Error("Usage: npm run check:wss -- wss://HOST/neos --origin https://SITE.pages.dev");
}
const originUrl = new URL(origin);
assert.equal(originUrl.origin, origin.replace(/\/$/, ""), "Pass a complete site origin without a path");
target.protocol = "https:";
const key = randomBytes(16).toString("base64");
const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
const started = performance.now();

try {
  await new Promise((resolveCheck, rejectCheck) => {
    const request = https.request(target, {
      // Normal SNI and certificate verification, exactly as a public WSS client.
      headers: {
        Connection: "Upgrade", Upgrade: "websocket", Origin: origin,
        "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": key,
      },
    });
    const timer = setTimeout(() => request.destroy(new Error("WSS handshake timed out after 15s")), 15000);
    request.once("upgrade", (response, socket) => {
      clearTimeout(timer);
      try {
        assert.equal(response.statusCode, 101);
        assert.equal(response.headers["sec-websocket-accept"], accept);
        console.log(`WSS 101 and trusted TLS passed in ${Math.round(performance.now() - started)}ms`);
        console.log("Handshake only: room login and complete matches still need browser testing.");
        // Masked WebSocket close with status 1000; no player login packets.
        socket.end(Buffer.from([0x88, 0x82, 0, 0, 0, 0, 0x03, 0xe8]));
        socket.once("error", () => {});
        socket.setTimeout(1000, () => socket.destroy());
        resolveCheck();
      } catch (error) {
        socket.destroy();
        rejectCheck(error);
      }
    });
    request.once("response", (response) => {
      clearTimeout(timer);
      response.resume();
      rejectCheck(new Error(`Expected 101, got HTTP ${response.statusCode}. 403: check Origin/header rules; 502: check Neos/connector.`));
    });
    request.once("error", (error) => { clearTimeout(timer); rejectCheck(error); });
    request.end();
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
