import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium, expect } from "@playwright/test";
const server = await preview({
  build: { outDir: ".audit-tmp/card-stats-playback-ui/web" },
  preview: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log("PASS", name);
  } catch (e) {
    failures.push(name + ": " + e.message.split("\n")[0]);
  }
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.addInitScript(() => localStorage.setItem("language", "cn"));
  await page.goto(server.resolvedUrls.local[0]);
  await expect(page.locator("main[data-ready=true]")).toBeVisible({
    timeout: 60000,
  });
  await page.evaluate(() => window.__stats.online());
  await page.waitForTimeout(500);
  for (const zone of [1, 4]) {
    await page.evaluate((zone) => {
      window.__followup.stores.cardStore.inner[0].location.zone = zone;
      window.__stats.detail();
    }, zone);
    await check("Known identity in " + (zone === 1 ? "hand" : "grave"), () =>
      expect(
        page
          .getByTestId("card-identity-details")
          .locator("[data-identity-row=current]"),
      ).toContainText("黑魔术师"),
    );
    await page.evaluate(() => window.__stats.close());
  }
  await page.evaluate(() => {
    window.__stats.originalCards = structuredClone(window.__stats.nativeCards);
    window.__stats.practice();
  });
  await expect(page.getByTestId("practice-board")).toBeVisible();
  await page
    .locator(
      '[data-testid=practice-card][data-location="4"][data-sequence="0"]',
    )
    .click();
  await expect(
    page.getByTestId("card-stats-details").locator("[data-stat-row=current]"),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__stats.nativeCards = [];
    window.__stats.worker.emit();
  });
  await check("Disappeared instance loses live stats", () =>
    expect(
      page.getByTestId("card-stats-details").locator("[data-stat-row=current]"),
    ).toHaveCount(0),
  );
  await check("Disappeared instance loses live identity", () =>
    expect(
      page
        .getByTestId("card-identity-details")
        .locator("[data-identity-row=current]"),
    ).toHaveCount(0),
  );
  await page.locator(".ant-drawer-open .ant-drawer-close").click();
  await page.evaluate(() => {
    window.__stats.nativeCards = structuredClone(window.__stats.originalCards);
    window.__stats.worker.emit();
  });
  await page
    .locator(
      '[data-testid=practice-card][data-location="4"][data-sequence="0"]',
    )
    .click();
  await page.evaluate(() => {
    const a = window.__stats.nativeCards.shift();
    window.__stats.nativeCards[0].overlay = [a.code];
    window.__stats.worker.emit();
  });
  await check(
    "Attachment downgrades prior field instance to printed only",
    () =>
      expect(
        page
          .getByTestId("card-stats-details")
          .locator("[data-stat-row=current]"),
      ).toHaveCount(0),
  );
  await page.locator(".ant-drawer-open .ant-drawer-close").click();
  await page.evaluate(() => {
    window.__stats.nativeCards = structuredClone(window.__stats.originalCards);
    window.__stats.nativeCards[0].location = 2;
    window.__stats.worker.emit();
  });
  await page
    .locator('[data-testid=practice-card][data-location="2"]')
    .first()
    .click();
  await check("Practice hand identity", () =>
    expect(
      page
        .getByTestId("card-identity-details")
        .locator("[data-identity-row=current]"),
    ).toContainText("黑魔术师"),
  );
  await page.locator(".ant-drawer-open .ant-drawer-close").click();
  await page.evaluate(() => {
    window.__stats.practiceMock = false;
    window.__stats.replayMock = true;
    window.__stats.nativeCards[0].location = 16;
    window.__stats.autoplay(false);
    location.hash = "#/replays";
  });
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/replay/native-confirm-search.yrp");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".replay-progress")).toContainText("步骤 0", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "列表视图", exact: true }).click();
  await page.locator('.replay-card[data-location="16"]').first().click();
  await check("Replay grave identity", () =>
    expect(
      page
        .getByTestId("card-identity-details")
        .locator("[data-identity-row=current]"),
    ).toContainText("黑魔术师"),
  );
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  await server.httpServer.close();
}
