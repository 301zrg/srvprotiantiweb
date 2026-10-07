import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { join, resolve, sep } from "node:path";
import { startNginxGateway, startQuickTunnel, stopChild } from "./tunnel_support.mjs";

const audit = resolve(".audit-tmp");
mkdirSync(audit, { recursive: true });
const runtime = mkdtempSync(join(audit, "tunnel-gateway-"));
const allowedOrigin = "http://127.0.0.1:4173";
const frames = Buffer.from([0x82, 3, 1, 2, 3]);
function fixturePayload(buffer) {
  if (buffer.length < 2) return;
  assert.equal(buffer[0], 0x82, "Expected a complete binary fixture frame");
  const masked = (buffer[1] & 0x80) !== 0;
  const length = buffer[1] & 0x7f;
  assert.equal(length, 3);
  const offset = masked ? 6 : 2;
  if (buffer.length < offset + length) return;
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    for (let index = 0; index < payload.length; index++) {
      payload[index] ^= buffer[2 + index % 4];
    }
  }
  return payload;
}
const received = [];
const sockets = new Set();
const upstream = http.createServer((_, response) => response.writeHead(404).end());
upstream.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
upstream.on("upgrade", (request, socket) => {
  received.push(request.headers);
  const accept = createHash("sha1").update(request.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let incoming = Buffer.alloc(0);
  socket.on("data", (data) => {
    incoming = Buffer.concat([incoming, data]);
    const payload = fixturePayload(incoming);
    if (payload) {
      // A proxy may replace the WebSocket mask without changing a YGO message.
      assert.deepEqual(payload, Buffer.from([1, 2, 3]));
      socket.write(frames);
    }
  });
});

const freePort = () => new Promise((done) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => done(port)); });
});
async function requestUpgrade(url, headers = {}) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const key = randomBytes(16).toString("base64");
  const expectedAccept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  return new Promise((done, fail) => {
    const request = transport.request(target, { headers: {
      Connection: "Upgrade", Upgrade: "websocket", Origin: allowedOrigin,
      "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": key, ...headers,
    } });
    const timer = setTimeout(() => request.destroy(new Error("Gateway request timed out")), 20000);
    request.on("error", (error) => { clearTimeout(timer); fail(error); });
    request.on("response", (response) => { clearTimeout(timer); response.resume(); done(response.statusCode); });
    request.on("upgrade", (response, socket, head) => {
      assert.equal(response.headers["sec-websocket-accept"], expectedAccept);
      let body = head;
      socket.on("data", (data) => {
        body = Buffer.concat([body, data]);
        const payload = fixturePayload(body);
        if (payload) {
          clearTimeout(timer);
          assert.deepEqual(payload, Buffer.from([1, 2, 3]), "Binary message must survive the proxy unchanged");
          socket.destroy();
          done(response.statusCode);
        }
      });
      socket.on("error", fail);
      socket.write(Buffer.from([0x82, 0x83, 0x11, 0x22, 0x33, 0x44, 1 ^ 0x11, 2 ^ 0x22, 3 ^ 0x33]));
    });
    request.end();
  });
}

let nginx;
let tunnel;
try {
  await new Promise((done) => upstream.listen(0, "127.0.0.1", done));
  const upstreamPort = upstream.address().port;
  const gatewayPort = await freePort();
  nginx = await startNginxGateway({ runtime, upstreamPort, gatewayPort });
  const local = `http://127.0.0.1:${gatewayPort}/neos`;
  assert.equal(await requestUpgrade(local, { "CF-Connecting-IP": "198.51.100.17", "X-Forwarded-For": "203.0.113.201" }), 101);
  assert.equal(received.at(-1)["x-forwarded-for"], "198.51.100.17", "Untrusted XFF must be overwritten");
  assert.equal(await requestUpgrade(local, { "CF-Connecting-IP": "2001:db8::17" }), 101);
  assert.equal(received.at(-1)["x-forwarded-for"], "2001:db8::17");
  assert.equal(await requestUpgrade(local), 403, "Missing trusted connector IP must fail");
  assert.equal(await requestUpgrade(local, { "CF-Connecting-IP": "198.51.100.17,203.0.113.1" }), 403);
  assert.equal(await requestUpgrade(local, { "CF-Connecting-IP": "198.51.100.17", Origin: "https://untrusted.example" }), 403);
  assert.equal(await requestUpgrade(local.replace("/neos", "/admin")), 404);
  if (process.platform === "win32") {
    await new Promise((done, fail) => {
      const checked = spawn("powershell", ["-NoProfile", "-File", "deployment/windows/Test-NeosGateway.ps1", "-GatewayPort", String(gatewayPort)], { windowsHide: true });
      let output = "";
      checked.stdout.on("data", (chunk) => { output += chunk; });
      checked.stderr.on("data", (chunk) => { output += chunk; });
      checked.once("error", fail);
      checked.once("exit", (code) => code === 0 ? done() : fail(new Error(output)));
    });
    console.log("Windows deployment gateway checker passed against the live isolated proxy");
  }
  console.log("Nginx gateway passed: IPv4/IPv6, overwritten XFF, binary frames, rejected Origin/missing IP/extra paths");
  if (process.argv.includes("--public")) {
    tunnel = await startQuickTunnel({ runtime, gatewayPort });
    const endpoint = tunnel.url.replace("wss://", "https://");
    assert.equal(await requestUpgrade(endpoint, { "CF-Connecting-IP": "203.0.113.201", "X-Forwarded-For": "203.0.113.201" }), 101);
    const actual = received.at(-1)["x-forwarded-for"];
    assert.ok(net.isIP(actual), "Cloudflare must supply a real IP");
    assert.notEqual(actual, "203.0.113.201", "Public caller cannot spoof the Cloudflare client IP");
    assert.notEqual(actual, "127.0.0.1", "Players must not be grouped under the connector IP");
    console.log("Public Quick Tunnel passed trusted TLS, WebSocket binary forwarding and real-IP spoof rejection");
  }
} finally {
  await stopChild(tunnel?.child);
  await stopChild(nginx);
  for (const socket of sockets) socket.destroy();
  await new Promise((done) => upstream.close(done));
  assert.ok(runtime.startsWith(audit + sep));
  rmSync(runtime, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
