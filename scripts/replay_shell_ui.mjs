// Replay player in the duel layout: header only hidden while playing, and
// rotating, switching views or opening panels never recreates the Worker or
// resumes playback; leaving playback terminates the Worker.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { chromium, expect } from "@playwright/test";

import { replayControl } from "./replay_controls.mjs";

const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({
  headless: true,
  executablePath: existsSync(edge) ? edge : undefined,
});
try {
  for (const [name, start, turned] of [
    ["phone", { width: 390, height: 844 }, { width: 844, height: 390 }],
    ["tablet", { width: 1112, height: 768 }, { width: 834, height: 1046 }],
  ]) {
    const context = await browser.newContext({
      viewport: start,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      localStorage.setItem(
        "__neo_setting_config__",
        JSON.stringify({ replayAutoPlay: false }),
      );
      const Native = window.Worker;
      window.__workers = { created: 0, terminated: 0 };
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          window.__workers.created++;
        }
        terminate() {
          window.__workers.terminated++;
          return super.terminate();
        }
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${origin}/#/replays`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 60000,
    });
    // The library keeps the site header; only the player hides it.
    await expect(page.locator("nav a[href='#/replays']")).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/replay/native-deckout.yrp");
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(page.locator(".replay-field-board")).toBeVisible({
      timeout: 60000,
    });
    await expect(page.locator("nav a[href='#/replays']")).toHaveCount(0);
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "单步", exact: true }).click();
      await page.waitForTimeout(150);
    }
    const progress = page.locator(".replay-progress").first();
    const before = await progress.innerText();
    const workers = () => page.evaluate(() => window.__workers);
    assert.deepEqual(await workers(), { created: 1, terminated: 0 });

    await page.setViewportSize(turned);
    await page.waitForTimeout(400);
    await page.setViewportSize(start);
    await page.waitForTimeout(400);
    await replayControl(page, "列表视图");
    await expect(page.locator(".replay-board")).toBeVisible();
    await replayControl(page, "场地视图");
    await expect(page.locator(".replay-field-board")).toBeVisible();
    await page.getByTestId("replay-more").first().click();
    await expect(page.getByTestId("replay-more-panel")).toBeVisible();
    await page.getByTestId("replay-more-panel-close").click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "操作记录", exact: true }).click();
    const historyClose = page.getByTestId("replay-history-panel-close");
    // Phones open a panel; docked layouts switch to the sidebar tab instead.
    await historyClose
      .waitFor({ state: "visible", timeout: 1500 })
      .catch(() => {});
    if (await historyClose.isVisible()) {
      await historyClose.click();
      await page.waitForTimeout(300);
    }
    await page.locator(".replay-card").first().click();
    await expect(page.getByTestId("replay-card-detail")).toBeVisible();
    await page.getByTestId("replay-card-detail-close").click();
    await page.waitForTimeout(800);

    assert.equal(await progress.innerText(), before, "Playback stays paused");
    await expect(
      page.getByRole("button", { name: "继续播放", exact: true }).first(),
    ).toBeVisible();
    assert.deepEqual(
      await workers(),
      { created: 1, terminated: 0 },
      "Layout changes keep the same Worker",
    );

    await replayControl(page, "退出播放");
    await expect(page.locator(".replay-page")).toBeVisible();
    await expect(page.locator("nav a[href='#/replays']")).toBeVisible();
    assert.equal((await workers()).terminated, 1, "Exit terminates the Worker");
    assert.deepEqual(errors, []);
    console.log(`PASS replay shell ${name}: header, rotation, panels, exit`);
    await context.close();
  }
} finally {
  await browser.close();
}
