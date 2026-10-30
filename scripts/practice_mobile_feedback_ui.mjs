// Static production build, real fixed Core: Pot of Duality in the hand test.
// Phones show the three excavated cards in one row with the confirm row on
// screen; the action log defaults to text rows on phones and card art on
// desktop, and a card name in a text row opens the card detail.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const POT_OF_DUALITY = 98645731;
const folder = ".audit-tmp/practice-mobile-feedback";
mkdirSync(folder, { recursive: true });
const server = await preview({
  build: { outDir: process.env.PRACTICE_TEST_DIST || "dist" },
  preview: { host: "127.0.0.1", port: 0 },
});
const origin = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const reports = [];
try {
  for (const [name, width, height] of [
    ["portrait", 390, 844],
    ["landscape", 844, 390],
    ["desktop", 1280, 800],
  ]) {
    const mobile = name !== "desktop";
    const page = await browser.newPage({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("language", "cn"));
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
      POT_OF_DUALITY,
    );
    await page.goto(origin + "/#/practice", { waitUntil: "domcontentloaded" });
    const hand = page.locator(
      '[data-testid="practice-card"][data-player="0"][data-location="2"]',
    );
    await expect(hand.first()).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(1500);
    await hand.first().click();
    await page
      .locator('[data-testid="practice-card-action"]:visible', {
        hasText: "发动",
      })
      .first()
      .click();
    const choices = page.locator(".practice-choice[data-index]");
    for (let i = 0; i < 20 && (await choices.count()) < 3; i++) {
      const slot = page
        .locator('[data-testid="practice-slot"][data-selectable="true"]')
        .first();
      if (await slot.isVisible().catch(() => false)) await slot.click();
      await page.waitForTimeout(500);
    }
    await expect(choices).toHaveCount(3);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${folder}/${name}-pot.png` });
    const boxes = await choices.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: Math.round(box.top), bottom: box.bottom };
      }),
    );
    const confirm = page
      .locator(".practice-choice-footer button.ant-btn-primary")
      .last();
    if (mobile) {
      assert.equal(
        new Set(boxes.map((box) => box.top)).size,
        1,
        `${name}: the three excavated cards share one row`,
      );
      for (const box of boxes)
        assert.ok(box.bottom <= height, `${name}: every card is on screen`);
      await expect(confirm).toBeInViewport();
    }
    await choices.first().click();
    await confirm.click();
    await page.waitForTimeout(2500);
    await page.getByTestId("practice-history").click();
    const log = page.getByTestId("practice-history-content");
    await expect(log).toBeVisible();
    await expect(log).toHaveAttribute(
      "data-history-style",
      mobile ? "text" : "image",
    );
    const rows = log.locator("[data-history-kind]");
    await expect(rows).toHaveCount(7);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${folder}/${name}-history.png` });
    if (mobile) {
      // Text rows: every entry fits the panel without scrolling, and the
      // card name still opens the detail.
      const lastRow = await rows.last().boundingBox();
      assert.ok(
        lastRow.y + lastRow.height <= height,
        `${name}: all rows visible`,
      );
      assert.equal(
        await log.locator("img").count(),
        0,
        "no card art in text mode",
      );
      const nameButton = log
        .locator(`button[data-card-code="${POT_OF_DUALITY}"]`)
        .first();
      await expect(nameButton).toContainText("强欲而谦虚之壶");
      await nameButton.click();
      await expect(
        page.locator(".practice-detail-image:visible"),
      ).toBeVisible();
    } else
      assert.ok(
        (await log.locator("img").count()) > 0,
        "desktop keeps card art",
      );
    assert.deepEqual(errors, []);
    reports.push({ name, rows: boxes.length });
    await page.close();
  }
  writeFileSync(`${folder}/report.json`, JSON.stringify(reports, null, 2));
  console.log(
    "Practice mobile feedback: Pot of Duality layout and text/image action log passed.",
  );
} finally {
  await browser.close();
  await server.httpServer.close();
}
