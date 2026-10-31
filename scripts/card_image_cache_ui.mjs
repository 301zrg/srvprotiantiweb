// Card image cache on the real image host (needs network). No request
// interception: Playwright routes disable the HTTP cache, which this test
// compares against. A persistent profile stands in for reopening the browser.
//
// Checks: one download per card even when shown many times; a reopened browser
// serves cached cards without the image host; the deck editor fetches only
// cards near the visible area; clearing the cache keeps decks and inputs.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const POT = 98645731;
const folder = ".audit-tmp/card-image-cache-ui";
mkdirSync(folder, { recursive: true });
const profile = mkdtempSync(join(folder, "profile-"));
const server = await preview({
  build: { outDir: process.env.PRACTICE_TEST_DIST || "dist" },
  preview: { host: "127.0.0.1", port: 0 },
});
const origin = server.resolvedUrls.local[0];
const executablePath =
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const imageHost = /moecube\.com.*\/images\/ygopro-images-[^/]+\/(\d+)\.jpg/;

async function open(viewport = { width: 1280, height: 800 }) {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath,
    viewport,
  });
  const requests = [];
  context.on("request", (request) => {
    // One download = the entry request; its redirect is not counted again.
    if (request.redirectedFrom()) return;
    const match = imageHost.exec(request.url());
    if (match) requests.push(Number(match[1]));
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, requests, errors };
}

async function practice(page) {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(page.locator('main[data-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  await page.evaluate(
    (code) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("decks");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("decks", "readwrite");
          tx.objectStore("decks").clear();
          tx.objectStore("decks").put(
            {
              deckName: "Pot fixture",
              main: Array(40).fill(code),
              extra: [],
              side: [],
            },
            "Pot fixture",
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    POT,
  );
  await page.goto(origin + "/#/practice", { waitUntil: "domcontentloaded" });
  await expect(
    page
      .locator(
        '[data-testid="practice-card"][data-player="0"][data-location="2"]',
      )
      .first(),
  ).toBeVisible({ timeout: 60000 });
  // Card art is a CSS background on .ygo-card; wait until it is set.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            Array.from(
              document.querySelectorAll(
                '[data-testid="practice-card"] [class*="ygo-card"]',
              ),
            ).filter((el) =>
              getComputedStyle(el).getPropertyValue("--src").includes("blob:"),
            ).length,
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(5);
}

const report = {};
try {
  // First visit: 11 Pot cards on the board (two hands), one download.
  let session = await open();
  await practice(session.page);
  report.firstVisitPotRequests = session.requests.filter(
    (code) => code === POT,
  ).length;
  assert.equal(report.firstVisitPotRequests, 1, "the same card downloads once");
  report.cachedKeys = await session.page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(
      names.find((name) => name.includes("card-images")),
    );
    return (await cache.keys()).map((request) => request.url);
  });
  assert.ok(
    report.cachedKeys.some((url) => url.includes(`${POT}.jpg`)),
    "stored by its entry URL",
  );
  await session.context.close();

  // Reopened browser: the card comes from Cache Storage, not the image host.
  session = await open();
  await practice(session.page);
  report.reopenedPotRequests = session.requests.filter(
    (code) => code === POT,
  ).length;
  assert.equal(
    report.reopenedPotRequests,
    0,
    "reopened browser reuses the cached card",
  );

  // Deck editor: a search page mounts ~200 cards but loads only nearby ones.
  await session.page.goto(origin + "/#/build", {
    waitUntil: "domcontentloaded",
  });
  await expect(session.page.getByTestId("deck-card").first()).toBeVisible({
    timeout: 60000,
  });
  const before = session.requests.length;
  await session.page.waitForTimeout(10000);
  report.deckEditorMounted = await session.page
    .getByTestId("deck-card")
    .count();
  report.deckEditorRequests = session.requests.length - before;
  assert.ok(
    report.deckEditorRequests < report.deckEditorMounted / 2,
    `deck editor loads nearby cards only (${report.deckEditorRequests} of ${report.deckEditorMounted})`,
  );
  await session.page.screenshot({ path: `${folder}/deck-editor.png` });

  // Clearing the card cache keeps decks.
  await session.page.goto(origin + "/#/practice", {
    waitUntil: "domcontentloaded",
  });
  await session.page.getByTestId("practice-settings").click();
  await session.page
    .getByTestId("settings-navigation")
    .getByRole("button")
    .nth(2)
    .click();
  await session.page.getByTestId("setting-clear-card-cache").click();
  await expect(
    session.page.getByTestId("setting-card-cache-status"),
  ).toContainText(/已清理|cleared|削除しました|삭제했습니다/);
  report.afterClear = await session.page.evaluate(async () => ({
    caches: (await caches.keys()).filter((name) => name.includes("card-images"))
      .length,
    deck: await new Promise((resolve) => {
      const request = indexedDB.open("decks");
      request.onsuccess = () => {
        const get = request.result
          .transaction("decks")
          .objectStore("decks")
          .get("Pot fixture");
        get.onsuccess = () => resolve(!!get.result);
      };
    }),
  }));
  assert.deepEqual(
    report.afterClear,
    { caches: 0, deck: true },
    "only card images are cleared",
  );
  assert.deepEqual(session.errors, []);
  await session.context.close();
  writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    "Card image cache: " +
      JSON.stringify(report, (key, value) =>
        key === "cachedKeys" ? value.length : value,
      ),
  );
} finally {
  await server.httpServer.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // The browser may still hold the profile briefly on Windows.
  }
}
