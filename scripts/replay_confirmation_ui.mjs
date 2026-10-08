import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const fixture =
  process.env.SRVPRO_REPLAY_FIXTURE ||
  "tests/fixtures/replay/native-confirm-search.yrp";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["portrait", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: name === "portrait",
      isMobile: name === "portrait",
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", ({ data }) => {
            if (data.type === "frame") {
              const { step, turn, consumed, total, end } = data.frame;
              window.__replayRegression = { step, turn, consumed, total, end };
            }
          });
        }
      };
    });
    const page = await context.newPage();
    let sockets = 0;
    page.on("websocket", () => sockets++);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/#/replays", { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(
      page.locator(".replay-board,.replay-field-board,.replay-error").first(),
    ).toBeVisible({ timeout: 60000 });
    assert.equal(await page.locator(".replay-error").count(), 0);
    const finish = async () => {
      await page.getByLabel("目标回合").fill("999");
      await page.getByRole("button", { name: "跳到回合", exact: true }).click();
      await expect
        .poll(
          async () => {
            const error = (
              await page.locator(".replay-error").allTextContents()
            ).join(" ");
            if (error) throw new Error(error);
            return page.evaluate(() => !!window.__replayRegression?.end);
          },
          { timeout: 45000 },
        )
        .toBe(true);
      const frame = await page.evaluate(() => window.__replayRegression);
      assert.equal(
        frame.consumed,
        frame.total,
        "All recorded responses must be consumed without retry",
      );
      if (!process.env.SRVPRO_REPLAY_FIXTURE)
        assert.equal(frame.end, "complete");
      return frame;
    };
    const first = await finish();
    await expect(page.locator(".replay-error")).toHaveCount(0);
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("步骤 0");
    const second = await finish();
    assert.deepEqual(second, first, "Restart must reach the same end state");
    await page.getByRole("button", { name: "退出播放", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载", exact: true }).click();
    const download = await downloadPromise;
    assert.deepEqual(
      readFileSync(await download.path()),
      readFileSync(fixture),
    );
    assert.equal(sockets, 0);
    await context.close();
    console.log(
      `Replay confirmation ${name}: full playback/restart/original download passed; ${first.consumed} responses, ${first.turn} turns, ${first.end}; zero WSS`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
