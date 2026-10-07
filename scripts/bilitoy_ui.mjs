// Exercise the real upload folder under Toy-like paths and an iframe sandbox.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium, expect } from "@playwright/test";

const release = process.argv[2] || readdirSync("releases")
  .filter(name => name.startsWith("bilitoy-") && existsSync(`releases/${name}/web/deployment-info.json`))
  .sort().at(-1);
assert.ok(release, "Run npm run package:bilitoy first");
const root = resolve(process.argv[2] || `releases/${release}/web`);
assert.ok(root.startsWith(resolve("releases") + sep), "Test only a project-local release");
assert.equal(JSON.parse(readFileSync(resolve(root, "deployment-info.json"), "utf8")).target, "bilitoy");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav" };
const prefix = "/toy/square/123-v1/";
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/seed") return response.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html><title>Fixture seed</title>");
  if (pathname === "/shell") return response.writeHead(200, { "Content-Type": "text/html" }).end(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;}iframe{display:block;width:100%;height:100%;border:0}</style><iframe src="${prefix}index.html" sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"></iframe>`);
  const match = /^\/toy\/[^/]+\/\d+-v\d+\/(.*)$/.exec(pathname);
  if (!match) return response.writeHead(404).end();
  const target = resolve(root, decodeURIComponent(match[1]) || "index.html");
  if (!target.startsWith(root + sep)) return response.writeHead(403).end();
  try {
    const bytes = await readFile(target);
    response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const folder = ".audit-tmp/bilitoy-ui";
mkdirSync(folder, { recursive: true });
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  for (const [name, viewport, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["mobile", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ viewport, locale: "zh-CN", isMobile: mobile, hasTouch: mobile, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [], requested = new Set();
    let sockets = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", () => sockets++);
    page.on("request", request => {
      if (request.url().startsWith(origin)) requested.add(new URL(request.url()).pathname);
    });
    page.on("response", response => {
      if (response.url().startsWith(origin) && response.status() >= 400)
        errors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    await context.route("**/*", route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (route.request().resourceType() === "image") return route.fulfill({ contentType: "image/gif",
        body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") });
      errors.push(`Unexpected external request: ${route.request().url()}`);
      return route.abort();
    });
    // Other Toy data in a shared origin must not be read, modified or deleted.
    await page.goto(`${origin}/seed`);
    await page.evaluate(async () => {
      localStorage.setItem("language", "en");
      localStorage.setItem("playerNickname", "OtherToyFixture");
      localStorage.setItem("__neo_setting_config__", "not-this-app-json");
      await new Promise((resolve, reject) => {
        const request = indexedDB.open("decks", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("decks");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("decks", "readwrite");
          transaction.objectStore("decks").put({ deckName: "OtherToyFixture", main: [], extra: [], side: [] }, "OtherToyFixture");
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    await page.goto(`${origin}/shell`, { waitUntil: "domcontentloaded" });
    const frame = await page.locator("iframe").elementHandle().then(handle => handle.contentFrame());
    await expect(frame.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
    await expect(frame.getByText("YGOPRO 1103 网页版")).toBeVisible();
    assert.equal(await frame.evaluate(() => window.fetchCard(89631139).text.name), "青眼白龙");
    for (const [label, code, cardName] of [
        ["English", "en", "Blue-Eyes White Dragon"], ["日本語", "ja", "青眼の白龍"],
        ["한국어", "ko", "푸른 눈의 백룡"], ["简体中文", "cn", "青眼白龙"],
    ]) {
        await frame.locator(".ant-select").first().click();
        await frame.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: label }).click();
        await expect.poll(() => frame.evaluate(() => localStorage.getItem("srvprotiantiweb:bilitoy:square%2F123:language"))).toBe(code);
        assert.equal(await frame.evaluate(() => window.fetchCard(89631139).text.name), cardName);
    }
    await frame.getByRole("button", { name: "进入联机" }).click();
    await expect(frame.locator("#player-nickname")).toHaveValue("");
    await frame.locator("#player-nickname").fill("ToyFixture");
    await frame.locator("#room-name").fill("TT");
    const endpoint = JSON.parse(readFileSync(resolve(root, "deployment-info.json"), "utf8")).wssUrl;
    if (endpoint) await expect(frame.getByTestId("connect-submit")).toBeEnabled();
    else await expect(frame.getByTestId("connect-submit")).toBeDisabled();
    // Never submit the online form or connect to the real server in this test.
    await frame.getByRole("button", { name: "编辑卡组" }).click();
    await expect(frame.getByTestId("deck-name")).toHaveValue("1103-sample", { timeout: 15000 });
    if (mobile) await frame.getByTestId("deck-tab-search").click();
    await frame.getByTestId("deck-search-input").fill("青眼白龙");
    await frame.getByTestId("deck-search-submit").click();
    await expect(frame.locator('[data-testid="deck-search-card"][data-card-code="89631139"]')).toBeVisible();
    await expect(frame.locator("symbol#icon-play")).toHaveCount(1);
    if (mobile) await frame.getByTestId("deck-tab-deck").click();
    const savedName = `Toy-${name}-saved`;
    await frame.getByTestId("deck-name").fill(savedName);
    await frame.getByTestId("deck-save").click();
    await frame.goto(`${origin}/toy/square/123-v2/index.html#/build`, { waitUntil: "domcontentloaded" });
    await expect(frame.getByTestId("deck-name")).toHaveValue(savedName, { timeout: 30000 });
    if (mobile) await frame.getByTestId("deck-tab-manage").click();
    const downloadPromise = page.waitForEvent("download");
    await frame.getByRole("button", { name: `下载 ${savedName}`, exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `${savedName}.ydk`);
    const content = readFileSync(await download.path(), "utf8");
    assert.ok(content.includes("#main") && content.includes("#extra") && content.includes("!side"));
    assert.equal(content.split(/\r?\n/).filter(line => /^\d+$/.test(line)).length, 40);
    await frame.locator('input[type="file"]').setInputFiles({ name: "Toy-import.ydk", mimeType: "text/plain", buffer: Buffer.from(content) });
    await expect(frame.getByTestId("deck-name")).toHaveValue("Toy-import");
    await frame.goto(`${origin}/toy/square/456-v1/index.html#/build`, { waitUntil: "domcontentloaded" });
    await expect(frame.getByTestId("deck-name")).toHaveValue("1103-sample", { timeout: 30000 });
    assert.equal(await frame.evaluate(() => localStorage.getItem("language")), "en");
    const databases = await frame.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
    assert.ok(databases.includes("decks") && databases.includes("srvprotiantiweb:bilitoy:square%2F123:decks") && databases.includes("srvprotiantiweb:bilitoy:square%2F456:decks"));
    assert.equal(sockets, 0, "No production WebSocket should be opened");
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.ok([...requested].some(path => path.endsWith("/sql-wasm.wasm")), "Real SQLite WASM must load");
    assert.ok([...requested].every(path => !/\.(cdb|conf|ydk)$/.test(path)), "No filtered resource suffix may be requested");
    for (const locale of ["zh-CN", "en-US", "ja-JP", "ko-KR"])
      for (const resource of ["cards.data", "strings.data"])
        assert.ok([...requested].some(path => path.includes(`/${locale}/${resource}`)), `Missing ${locale}/${resource}`);
    await page.screenshot({ path: `${folder}/${name}.png`, fullPage: true });
    results.push({ name, viewport, fourLanguageResources: true, persistedAcrossVersionPaths: true,
      ydkImportExport: true, separateToyStorage: true, wasmLoaded: true, onlineLoginSent: false });
    await context.close();
  }
  writeFileSync(`${folder}/results.json`, JSON.stringify({ root, results }, null, 2));
  console.log("BiliToy upload UI passed: nested iframe paths, four languages, SQLite WASM, deck persistence, YDK import/export and Toy storage isolation.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
