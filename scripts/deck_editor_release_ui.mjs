import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { chromium, expect } from "@playwright/test";

// Checks the normal lazy-loaded build, without test-only imports or HTTP interception.
const expected =
  process.argv[2] ||
  JSON.parse(readFileSync("dist/deployment-info.json")).sourceCommit;
const origin =
  process.env.VERIFY_SITE_URL ||
  process.env.SMOKE_URL ||
  "http://127.0.0.1:4173";
assert.match(expected, /^[0-9a-f]{40}$/);
const output = `.audit-tmp/deck-editor/${
  origin.startsWith("https:") ? "production" : "normal-build"
}`;
mkdirSync(output, { recursive: true });
async function get(path) {
  const response = await fetch(origin + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, path);
  return Buffer.from(await response.arrayBuffer());
}
const metadata = JSON.parse(
  await get(`/deployment-info.json?check=${Date.now()}`),
);
assert.equal(metadata.sourceCommit, expected);
const config = (await get("/duel-config.js")).toString();
assert.ok(
  config.includes(
    "wss://exports-cake-wanting-operational.trycloudflare.com/neos",
  ),
);
const assets = readdirSync("dist/assets").filter((name) =>
    /\.(js|css)$/.test(name),
  ),
  hashes = [];
for (let i = 0; i < assets.length; i += 6) {
  await Promise.all(
    assets.slice(i, i + 6).map(async (name) => {
      const local = readFileSync(`dist/assets/${name}`),
        remote = await get(`/assets/${name}`);
      const hash = (value) => createHash("sha256").update(value).digest("hex");
      assert.equal(hash(local), hash(remote), name);
      assert.ok(
        !/__editor|__sideTest|__handImports/.test(local.toString()),
        `Test hook in normal asset ${name}`,
      );
      hashes.push({ name, sha256: hash(remote) });
    }),
  );
}
if (process.argv.includes("--assets-only")) {
  writeFileSync(
    `${output}/documentation-deployment.json`,
    JSON.stringify({ metadata, hashes }, null, 2),
  );
  console.log(
    JSON.stringify({
      origin,
      sourceCommit: expected,
      matchedAssets: hashes.length,
    }),
  );
  process.exit(0);
}
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(edge) ? edge : undefined,
});
const reports = [];
let activePage;
try {
  for (const [profile, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ].filter(
    (p) =>
      !process.env.VERIFY_EDITOR_PROFILE ||
      p[0] === process.env.VERIFY_EDITOR_PROFILE,
  )) {
    for (const [language, add] of [
      ["cn", "添加"],
      ["en", "Add"],
      ["ja", "追加"],
      ["ko", "추가"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: mobile,
        hasTouch: mobile,
      });
      await context.addInitScript(
        (language) => localStorage.setItem("language", language),
        language,
      );
      const page = await context.newPage(),
        errors = [];
      activePage = page;
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 60000,
      });
      const name =
        `1103-ordered-test-${profile}-${language} — Long deck name with the complete label visible — `.repeat(
          2,
        );
      const fixture = {
        deckName: name,
        main: [89631139, 46986414, 26202165, 54652250],
        extra: [44508094],
        side: [5318639],
      };
      await page.evaluate(async (fixture) => {
        await new Promise((resolve, reject) => {
          const request = indexedDB.open("decks");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              transaction = db.transaction("decks", "readwrite");
            transaction.objectStore("decks").put(fixture, fixture.deckName);
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => reject(transaction.error);
          };
        });
        localStorage.setItem("selectedDeckName", fixture.deckName);
        sessionStorage.setItem("editingDeckName", fixture.deckName);
      }, fixture);
      // Reload after writing our own browser-local synthetic deck; no response interception.
      await page.goto(`${origin}/?deck-editor-check=${Date.now()}#/build`, {
        waitUntil: "domcontentloaded",
      });
      const field = page.getByTestId("deck-name"),
        cards = page.getByTestId("deck-zone-main").getByTestId("deck-card");
      await expect(field).toHaveValue(name, { timeout: 60000 });
      await expect(cards).toHaveCount(4);
      const metrics = await field.evaluate((el) => ({
        width: el.clientWidth,
        height: el.clientHeight,
        contentWidth: el.scrollWidth,
        contentHeight: el.scrollHeight,
      }));
      assert.ok(
        metrics.contentWidth <= metrics.width + 1 &&
          metrics.contentHeight <= metrics.height + 1,
      );
      if (mobile) {
        await cards.first().locator("..").getByTestId("deck-card-menu").click();
        await page
          .getByRole("menuitem", { name: new RegExp(`${add}$`) })
          .click();
        await expect(page.locator(".ant-dropdown:visible")).toHaveCount(0);
      } else
        await cards.first().locator("..").getByTestId("deck-card-add").click();
      await expect(cards).toHaveCount(5);
      if (mobile) {
        await page.getByTestId("deck-reorder-toggle").click();
        const source = page
            .getByTestId("deck-zone-main")
            .getByTestId("deck-card-reorder")
            .first(),
          target = cards.nth(2);
        await target.scrollIntoViewIfNeeded();
        await source.scrollIntoViewIfNeeded();
        await source.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const a = await source.boundingBox(),
          b = await target.boundingBox();
        assert.ok(a.width >= 44 && a.height >= 44);
        const cdp = await context.newCDPSession(page);
        const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
          end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        for (let step = 1; step <= 12; step++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [
              {
                x: start.x + ((end.x - start.x) * step) / 12,
                y: start.y + ((end.y - start.y) * step) / 12,
              },
            ],
          });
          await page.waitForTimeout(20);
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      } else await cards.first().dragTo(cards.nth(2));
      const ordered = [46986414, 26202165, 89631139, 54652250, 89631139];
      await expect
        .poll(() =>
          cards.evaluateAll((els) =>
            els.map((el) => Number(el.dataset.cardCode)),
          ),
        )
        .toEqual(ordered);
      await page.getByTestId("deck-save").click();
      async function stored() {
        return page.evaluate(
          (name) =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open("decks");
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  read = db.transaction("decks").objectStore("decks").get(name);
                read.onsuccess = () => {
                  db.close();
                  resolve(read.result);
                };
                read.onerror = () => reject(read.error);
              };
            }),
          name,
        );
      }
      await expect.poll(async () => (await stored()).main).toEqual(ordered);
      await page.screenshot({ path: `${output}/${profile}-${language}.png` });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(field).toHaveValue(name, { timeout: 60000 });
      await expect
        .poll(() =>
          cards.evaluateAll((els) =>
            els.map((el) => Number(el.dataset.cardCode)),
          ),
        )
        .toEqual(ordered);
      assert.deepEqual(errors, []);
      reports.push({
        profile,
        language,
        metrics,
        exactSavedOrder: ordered,
        errors,
      });
      console.log(
        `PASS ${origin} ${profile}/${language}: full name, add, actual drag, save and reload`,
      );
      await context.close();
    }
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${output}/failure.png` });
    console.log(
      await activePage
        .locator('[data-testid="deck-zone-main"] [data-testid="deck-card"]')
        .evaluateAll((els) =>
          els.map((el) => ({
            code: el.dataset.cardCode,
            index: el.dataset.cardIndex,
            rect: el.getBoundingClientRect().toJSON(),
            draggable: el.draggable,
          })),
        ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
writeFileSync(
  `${output}/report.json`,
  JSON.stringify(
    {
      metadata,
      config,
      hashes,
      reports,
      physicalPhones: false,
      playerMatches: 0,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    sourceCommit: expected,
    matchedAssets: hashes.length,
    editorCases: reports.length,
    physicalPhones: false,
    playerMatches: 0,
  }),
);
