// A real HTTP cache is required: Playwright routes disable the browser cache.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium, expect, webkit } from "@playwright/test";

const safari = process.argv.includes("--webkit");
const root = resolve("dist");
assert.ok(existsSync(resolve(root, "assets-manifest.json")), "Build first");
const roomModule = readdirSync(resolve(root, "assets")).find(name =>
  name.endsWith(".js") && readFileSync(resolve(root, "assets", name), "utf8").includes('"waitroom-ready-toggle"'));
assert.ok(roomModule, "Locate the actual lazy waiting-room module");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".conf": "text/plain",
  ".cdb": "application/octet-stream", ".svg": "image/svg+xml" };
let fault;
const requests = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  requests.push({ path: url.pathname, query: url.search, cache: request.headers["cache-control"] });
  if (url.pathname === "/__seed") return response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Seed</title>");
  if (url.pathname === "/duel-config.js") return response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end('window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:"wss://recovery.invalid/neos"};');
  if (fault?.match.test(url.pathname)) {
    fault.seen++;
    if (fault.remaining-- > 0) {
      return response.writeHead(fault.script ? 200 : fault.status || 200, {
        "Content-Type": fault.script ? "text/javascript" : "text/html",
        "Cache-Control": fault.script ? "public, max-age=3600" : "no-store",
      }).end(fault.script ? "export function broken(" : "<!doctype html><title>Temporary error</title>");
    }
  }
  const target = resolve(root, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!target.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    const bytes = await readFile(target);
    response.writeHead(200, {
      "Content-Type": types[extname(target)] || "application/octet-stream",
      "Cache-Control": /\.(js|css)$/.test(target) ? "public, max-age=3600" : "no-store",
    }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await (safari ? webkit : chromium).launch({ headless: true,
    executablePath: safari ? undefined : process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  const freshPage = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      class MockWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        readyState = 0;
        constructor() { setTimeout(() => { this.readyState = 1; this.onopen?.(new Event("open")); }, 0); }
        emit(opcode, payload) {
          const bytes = Uint8Array.from([0, 0, opcode, ...payload]);
          new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
          this.onmessage?.(new MessageEvent("message", { data: bytes.buffer }));
        }
        send(value) {
          if (new Uint8Array(value)[2] !== 18) return;
          setTimeout(() => {
            const host = new Uint8Array(20), view = new DataView(host.buffer);
            view.setUint32(0, 0x73ec4051, true); host[4] = 1; host[6] = 2;
            view.setInt32(12, 8000, true); host[16] = 5; host[17] = 1; view.setUint16(18, 180, true);
            this.emit(18, host); this.emit(19, [0]);
          }, 20);
        }
        close() { this.readyState = 3; this.onclose?.(new CloseEvent("close", { code: 1000 })); }
      }
      window.WebSocket = MockWebSocket;
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000);
    page.on("pageerror", error => console.log("Page error:", error.message, error.stack?.slice(0, 600)));
    page.on("console", message => { if (message.type() === "error") console.log("Console error:", message.text().slice(0, 600)); });
    await page.goto(origin + "/__seed");
    await page.evaluate(async () => {
      localStorage.setItem("language", "cn"); localStorage.setItem("playerNickname", "RecoveryTester");
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("decks", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("decks");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("decks", "readwrite");
        tx.objectStore("decks").put({ deckName: "RecoveryFixture", main: [89631139], extra: [], side: [] }, "RecoveryFixture");
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    return { page, context };
  };
  const ready = async page => {
    try { await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 }); }
    catch (error) { console.log(JSON.stringify({ body: await page.locator("body").innerText(), requests: requests.slice(-15) })); throw error; }
  };
  const deckPreserved = page => page.evaluate(async () => {
    const db = await new Promise(resolve => { const req = indexedDB.open("decks", 1); req.onsuccess = () => resolve(req.result); });
    const deck = await new Promise(resolve => { const req = db.transaction("decks").objectStore("decks").get("RecoveryFixture"); req.onsuccess = () => resolve(req.result); });
    db.close(); return deck?.main[0] === 89631139;
  });
  for (const [name, match, failures, status] of [
    ["wasm-html-retry", /sql-wasm\.wasm$/, 2, 200],
    ["cdb-html-retry", /cards\.cdb$/, 1, 200],
    ["strings-html-retry", /strings\.conf$/, 1, 200],
    ["banlist-http-retry", /lflist\.conf$/, 1, 503],
  ]) {
    const { page, context } = await freshPage();
    fault = { match, remaining: failures, seen: 0, status };
    await page.goto(origin + "/#/match", { waitUntil: "domcontentloaded" });
    await ready(page);
    assert.equal(fault.seen, failures + 1);
    assert.equal(await deckPreserved(page), true);
    results.push({ name, recovered: true });
    console.log(`Passed: ${name}`);
    await context.close();
  }
  for (const [name, match] of [["cdb-failure-reload", /cards\.cdb$/], ["wasm-failure-reload", /sql-wasm\.wasm$/]]) {
    const { page, context } = await freshPage();
    fault = { match, remaining: 3, seen: 0 };
    await page.goto(origin + "/#/match", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("page-load-error")).toBeVisible({ timeout: 45000 });
    assert.equal(fault.seen, 3);
    await page.getByTestId("retry-page-load").click();
    await ready(page);
    assert.ok(new URL(page.url()).searchParams.has("_reload"));
    assert.equal(await deckPreserved(page), true);
    results.push({ name, recovered: true, deckPreserved: true });
    console.log(`Passed: ${name}`);
    await context.close();
  }
  {
    const { page, context } = await freshPage();
    fault = undefined;
    await page.goto(origin + "/#/match", { waitUntil: "domcontentloaded" }); await ready(page);
    const roomPath = "/assets/" + roomModule;
    fault = { match: new RegExp(roomPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), remaining: 1, seen: 0, script: true };
    await page.locator("#room-name").fill("RecoveryRoom");
    await page.getByTestId("connect-submit").click();
    await expect(page.getByTestId("page-load-error")).toBeVisible();
    await expect(page.getByTestId("page-load-error")).toContainText("Page: room");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("page-load-error")).toBeVisible();
    assert.equal(fault.seen, 1, "normal reload reuses the broken module in the real HTTP cache");
    await page.getByTestId("retry-page-load").click();
    await expect(page.locator("#player-nickname")).toHaveValue("RecoveryTester", { timeout: 45000 });
    assert.ok(fault.seen >= 2, "repair must fetch the canonical module again");
    assert.equal(await deckPreserved(page), true);
    await page.locator("#room-name").fill("RecoveryRoom"); await page.getByTestId("connect-submit").click();
    await expect(page.getByTestId("waitroom")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#player-nickname")).toHaveValue("RecoveryTester");
    for (const route of ["duel", "side"]) {
      await page.goto(`${origin}/#/${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#player-nickname")).toHaveValue("RecoveryTester");
      await expect(page.getByTestId("page-load-error")).toHaveCount(0);
    }
    results.push({ name: "cached-truncated-module", normalReloadReproduced: true,
      repairedCanonicalCache: true, rejoinSucceeded: true, deckPreserved: true, sessionReloadRecovered: true });
    await context.close();
  }
  console.log(JSON.stringify({ engine: safari ? "webkit" : "chromium", mobileEmulation: true, results }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
