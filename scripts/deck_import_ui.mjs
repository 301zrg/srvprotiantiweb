import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer as httpServer } from "node:http";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";

const built = process.argv.includes("--built");
const secure = process.argv.includes("--https");
const sample = {
  main: [89631139, 89631139],
  extra: [23995346, 44508094, 84013237],
  side: [44508094, 89631139],
};
const title = "接收样本 & G2";
const toYdk = (d) =>
  "#main\n" +
  d.main.join("\n") +
  "\n#extra\n" +
  d.extra.join("\n") +
  "\n!side\n" +
  d.side.join("\n") +
  "\n";
const toBuffer = (d) => {
  const cards = [...d.main, ...d.extra, ...d.side],
    raw = Buffer.alloc(8 + cards.length * 4);
  raw.writeUInt32LE(d.main.length + d.extra.length, 0);
  raw.writeUInt32LE(d.side.length, 4);
  cards.forEach((id, i) => raw.writeUInt32LE(id, 8 + i * 4));
  return raw;
};
const formats = {
  "ydk-utf8-base64url": Buffer.from(toYdk(sample)),
  "ygopro-update-deck-base64url": toBuffer(sample),
  "deck-json-base64url": Buffer.from(JSON.stringify(sample)),
};
let vite, browser, origin, sourceOrigin;
const results = [];
const source = httpServer((_, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><button data-format="ydk">Send ydk</button><button data-format="ygopro-update-deck">Send buffer</button><button data-format="deck-json">Send json</button><script>
    window.results=[]; const channel='srvprotiantiweb:deck-import';
    document.querySelectorAll('button').forEach(button=>button.onclick=()=>{
      window.results=[];
      const format=button.dataset.format;
      const request='1234567890abcdef1234567890abcdef'; let peer,sent=false;
      addEventListener('message',e=>{
        if(e.origin!==${JSON.stringify(
          origin?.replace(/\/$/, ""),
        )}||e.source!==peer||e.data.request!==request||e.data.channel!==channel)return;
        if(e.data.type==='ready'&&!sent){
          sent=true;
          peer.postMessage({channel,version:1,type:'payload',kind:'deck',request:'wrong-request',format:'deck-json',deck:${JSON.stringify(
            sample,
          )},title:'wrong'},e.origin);
          setTimeout(()=>{const data={channel,version:1,type:'payload',kind:'deck',request,format,title:'Bridge fixture'};
            if(format==='ydk')data.text=${JSON.stringify(toYdk(sample))};
            else if(format==='ygopro-update-deck')data.bytes=Uint8Array.from(${JSON.stringify(
              [...toBuffer(sample)],
            )}).buffer;
            else data.deck=${JSON.stringify(sample)};
            peer.postMessage(data,e.origin);peer.postMessage(data,e.origin);},100);
        }else if(e.data.type==='result')window.results.push(e.data.status);
      });
      peer=window.open(${JSON.stringify(
        origin,
      )}+'#/import?'+new URLSearchParams({v:'1',kind:'deck',bridge:'1',origin:location.origin,request}),'_blank');
    });
  </script>`);
});
async function savedDecks(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("decks");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const r = db.transaction("decks").objectStore("decks").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  });
}
async function assertEditor(page, name, deck) {
  await expect(page.getByTestId("deck-name")).toHaveValue(name, {
    timeout: 45000,
  });
  for (const zone of ["main", "extra", "side"])
    await expect(page.getByTestId("deck-zone-" + zone)).toHaveAttribute(
      "data-card-count",
      String(deck[zone].length),
    );
  assert.equal(await page.evaluate(() => location.hash), "#/build");
  assert.equal(
    await page.evaluate(() => window.__deckImportConnections.length),
    0,
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("playerNickname")),
    "SavedPlayer",
  );
}
try {
  const tls = secure
    ? {
        https: {
          cert: readFileSync(".audit-tmp/deck-import-cert/cert.pem"),
          key: readFileSync(".audit-tmp/deck-import-cert/key.pem"),
        },
      }
    : {};
  vite = built
    ? await preview({ preview: { host: "127.0.0.1", port: 0, ...tls } })
    : await createServer({ server: { host: "127.0.0.1", port: 0, ...tls } });
  if (!built) await vite.listen();
  origin = vite.resolvedUrls.local[0];
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  sourceOrigin = "http://127.0.0.1:" + source.address().port;
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
    ignoreDefaultArgs: ["--disable-popup-blocking"],
  });
  async function contextFor(mobile = false, storageBlocked = false) {
    const context = await browser.newContext({
      ignoreHTTPSErrors: secure,
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin) ||
      route.request().url().startsWith(sourceOrigin)
        ? route.continue()
        : route.abort(),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body:
          "window.__SRVPRO_DUEL_CONFIG__=" +
          JSON.stringify({
            duelWebSocketUrl: "wss://must-not-connect.invalid/neos",
            deckImportOrigins: [sourceOrigin],
          }) +
          ";",
      }),
    );
    await context.addInitScript(
      ({ storageBlocked }) => {
        localStorage.setItem("language", "cn");
        localStorage.setItem("playerNickname", "SavedPlayer");
        window.__deckImportConnections = [];
        const Native = WebSocket;
        window.WebSocket = class extends Native {
          constructor(url, protocols) {
            if (String(url).includes("must-not-connect.invalid")) {
              window.__deckImportConnections.push(String(url));
              throw new Error("Import must not connect");
            }
            super(url, protocols);
          }
        };
        if (storageBlocked)
          IDBFactory.prototype.open = () => {
            throw new DOMException("Test storage unavailable", "SecurityError");
          };
      },
      { storageBlocked },
    );
    return context;
  }
  function link(format, bytes, name = title) {
    return (
      origin +
      "#/import?" +
      new URLSearchParams({
        v: "1",
        kind: "deck",
        format,
        data: bytes.toString("base64url"),
        title: name,
      })
    );
  }
  for (const mobile of [false, true]) {
    const context = await contextFor(mobile),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [format, bytes] of Object.entries(formats)) {
      await page.goto(link(format, bytes), { waitUntil: "domcontentloaded" });
      await assertEditor(page, title, sample);
      const saved = await savedDecks(page);
      assert.deepEqual(
        saved.find((d) => d.deckName === title),
        { deckName: title, ...sample },
      );
      assert.equal(saved.filter((d) => d.deckName.startsWith(title)).length, 1);
      results.push({ format, mobile, saved: true, deduplicated: true });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await assertEditor(page, title, sample);
    const variant = { ...sample, main: [69247929] };
    await page.goto(
      link("deck-json-base64url", Buffer.from(JSON.stringify(variant))),
    );
    await assertEditor(page, title + " (2)", variant);
    const saved = await savedDecks(page);
    assert.deepEqual(saved.find((d) => d.deckName === title).main, sample.main);
    await page.goto(
      link(
        "ygopro-update-deck-base64url",
        formats["ygopro-update-deck-base64url"].subarray(0, -1),
      ),
    );
    await expect(page.getByTestId("deck-import-error")).toBeVisible({
      timeout: 45000,
    });
    assert.equal((await savedDecks(page)).length, saved.length);
    const unknown = {
      main: [123456789, 123456789],
      extra: [],
      side: [89631139],
    };
    await page.goto(
      link(
        "ygopro-update-deck-base64url",
        toBuffer(unknown),
        "Unknown fixture",
      ),
    );
    await expect(page.getByTestId("deck-import-zone-review"))
      .toBeVisible({ timeout: 15000 })
      .catch(async (error) => {
        console.log(
          JSON.stringify({
            case: "unknown-zone",
            body: await page.locator("body").innerText(),
            errors,
            route: await page.evaluate(() => location.hash.split("?")[0]),
          }),
        );
        throw error;
      });
    await expect(page.getByTestId("deck-import-zone-confirm")).toBeDisabled();
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 640 });
      const zoneBox = await page
        .getByTestId("deck-import-zone-123456789")
        .boundingBox();
      assert.ok(zoneBox.x >= 0 && zoneBox.x + zoneBox.width <= 320);
      mkdirSync(".audit-tmp/deck-import-ui", { recursive: true });
      await page.screenshot({
        path: ".audit-tmp/deck-import-ui/small-zone-review.png",
      });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.getByTestId("deck-import-zone-123456789").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("额外卡组", { exact: true })
      .click();
    await page.getByTestId("deck-import-zone-confirm").click();
    await assertEditor(page, "Unknown fixture", {
      main: [],
      extra: unknown.main,
      side: unknown.side,
    });
    if (mobile) await page.getByTestId("deck-tab-manage").click();
    await page
      .locator('input[type="file"]')
      .setInputFiles({
        name: "Local fixture.ydk",
        mimeType: "text/plain",
        buffer: Buffer.from(toYdk({ main: [43711255], extra: [], side: [] })),
      });
    await assertEditor(page, "Local fixture", {
      main: [43711255],
      extra: [],
      side: [],
    });
    assert.deepEqual(errors, []);
    await page.goto(
      origin +
        "#/import?" +
        new URLSearchParams({
          v: "1",
          kind: "deck",
          bridge: "1",
          origin: "http://denied.invalid",
          request: "1234567890abcdef1234567890abcdef",
        }),
    );
    await expect(page.getByTestId("deck-import-error")).toContainText(
      "此来源尚未允许",
      { timeout: 45000 },
    );
    assert.equal(await page.evaluate(() => location.hash), "#/import");
    if (mobile) {
      const box = await page.getByTestId("deck-import-back").boundingBox();
      assert.ok(
        box.width >= 44 &&
          box.height >= 44 &&
          box.x >= 0 &&
          box.x + box.width <= 390,
      );
      mkdirSync(".audit-tmp/deck-import-ui", { recursive: true });
      await page.screenshot({
        path: ".audit-tmp/deck-import-ui/mobile-error.png",
      });
    }
    results.push({
      mobile,
      reload: true,
      nameCollision: true,
      unknownZoneReview: true,
      localFileImport: true,
      invalidBufferRejected: true,
    });
    await context.close();
  }
  const concurrent = await contextFor(),
    a = await concurrent.newPage(),
    b = await concurrent.newPage();
  const other = { main: [43711255], extra: [], side: [89631139] };
  await Promise.all([
    a.goto(
      link(
        "deck-json-base64url",
        Buffer.from(JSON.stringify(sample)),
        "Concurrent",
      ),
    ),
    b.goto(
      link(
        "deck-json-base64url",
        Buffer.from(JSON.stringify(other)),
        "Concurrent",
      ),
    ),
  ]);
  await expect(a.getByTestId("deck-name")).toHaveValue(/Concurrent/, {
    timeout: 45000,
  });
  await expect(b.getByTestId("deck-name")).toHaveValue(/Concurrent/, {
    timeout: 45000,
  });
  const concurrentDecks = (await savedDecks(a)).filter((d) =>
    d.deckName.startsWith("Concurrent"),
  );
  assert.equal(concurrentDecks.length, 2);
  assert.equal(new Set(concurrentDecks.map((d) => d.deckName)).size, 2);
  assert.ok(
    concurrentDecks.some(
      (d) => JSON.stringify(d.main) === JSON.stringify(sample.main),
    ),
  );
  assert.ok(
    concurrentDecks.some(
      (d) => JSON.stringify(d.main) === JSON.stringify(other.main),
    ),
  );
  await concurrent.close();
  results.push({ crossTabNames: "atomic" });
  const bridgeContext = await contextFor(true),
    sender = await bridgeContext.newPage();
  await sender.goto(sourceOrigin);
  for (const format of ["ydk", "ygopro-update-deck", "deck-json"]) {
    const popupPromise = sender.waitForEvent("popup");
    await sender.locator('[data-format="' + format + '"]').click();
    const receiver = await popupPromise;
    await assertEditor(receiver, "Bridge fixture", sample);
    await expect
      .poll(() => sender.evaluate(() => window.results))
      .toContain("imported");
    assert.deepEqual(await sender.evaluate(() => window.results), [
      "received",
      "imported",
    ]);
    assert.equal(await receiver.evaluate(() => window.opener), null);
    assert.equal(
      (await savedDecks(receiver)).filter(
        (d) => d.deckName === "Bridge fixture",
      ).length,
      1,
    );
    await receiver.close();
    results.push({
      bridge: format,
      wrongRequestRejected: true,
      duplicatePayloadIgnored: true,
      openerReleased: true,
    });
  }
  await bridgeContext.close();
  const memoryContext = await contextFor(true, true),
    memoryPage = await memoryContext.newPage(),
    memoryErrors = [];
  memoryPage.on("pageerror", (e) => memoryErrors.push(e.message));
  await memoryPage.goto(
    link(
      "deck-json-base64url",
      formats["deck-json-base64url"],
      "Memory fixture",
    ),
  );
  await assertEditor(memoryPage, "Memory fixture", sample).catch(
    async (error) => {
      console.log(
        JSON.stringify({
          case: "storage-blocked",
          body: await memoryPage.locator("body").innerText(),
          errors: memoryErrors,
        }),
      );
      throw error;
    },
  );
  await expect(memoryPage.getByTestId("deck-storage-warning")).toBeVisible();
  await memoryPage.getByTestId("deck-tab-manage").click();
  const downloadPromise = memoryPage.waitForEvent("download");
  await memoryPage
    .getByRole("button", { name: "下载 Memory fixture", exact: true })
    .click();
  const download = await downloadPromise;
  assert.equal(
    readFileSync(await download.path(), "utf8").replace(
      /^#created by neos\n/,
      "",
    ),
    toYdk(sample).trimEnd(),
  );
  assert.deepEqual(memoryErrors, []);
  await memoryPage.getByTestId("deck-tab-deck").click();
  await memoryPage.getByTestId("deck-name").fill("Memory edited");
  await memoryPage
    .getByTestId("deck-zone-side")
    .getByRole("button", { name: /移动/ })
    .first()
    .click();
  await expect(memoryPage.getByTestId("deck-zone-extra")).toHaveAttribute(
    "data-card-count",
    "4",
  );
  await memoryPage.getByTestId("deck-tab-manage").click();
  const editedDownload = memoryPage.waitForEvent("download");
  await memoryPage
    .getByRole("button", { name: "下载 Memory fixture", exact: true })
    .click();
  const edited = await editedDownload;
  assert.equal(edited.suggestedFilename(), "Memory edited.ydk");
  const extraCodes = readFileSync(await edited.path(), "utf8")
    .split("#extra\n")[1]
    .split("!side")[0]
    .trim()
    .split("\n")
    .map(Number);
  assert.equal(extraCodes.length, 4);
  assert.equal(extraCodes.filter((id) => id === 44508094).length, 2);
  await memoryContext.close();
  results.push({
    blockedStorage: "temporary editor and complete YDK download",
  });
  const quotaContext = await contextFor();
  await quotaContext.addInitScript(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (String(key).startsWith("Quota fixture"))
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return add.call(this, value, key);
    };
  });
  const quotaPage = await quotaContext.newPage(),
    quotaErrors = [];
  quotaPage.on("pageerror", (e) => quotaErrors.push(e.message));
  await quotaPage.goto(
    link(
      "deck-json-base64url",
      formats["deck-json-base64url"],
      "Quota fixture",
    ),
  );
  await assertEditor(quotaPage, "Quota fixture", sample);
  await expect(quotaPage.getByTestId("deck-storage-warning")).toBeVisible();
  assert.equal(
    (await savedDecks(quotaPage)).filter((d) => d.deckName === "Quota fixture")
      .length,
    0,
  );
  assert.deepEqual(quotaErrors, []);
  await quotaContext.close();
  results.push({ failedWrite: "no false persisted record" });
  console.log(
    JSON.stringify({
      built,
      secure,
      results,
      realIosTested: false,
      actualBiliToyTested: false,
      productionAccessed: false,
    }),
  );
} finally {
  if (browser) await browser.close();
  if (vite) {
    if (built) await new Promise((resolve) => vite.httpServer.close(resolve));
    else await vite.close();
  }
  await new Promise((resolve) => source.close(resolve));
}
