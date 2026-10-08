import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  args: ["--autoplay-policy=user-gesture-required"],
});
const fixture = resolve("tests/fixtures/replay/native-deckout.yrp"),
  errors = [];
mkdirSync(".audit-tmp/replay-ui", { recursive: true });
try {
  for (const [name, viewport, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["portrait", { width: 390, height: 844 }, true],
    ["landscape", { width: 844, height: 390 }, true],
  ]) {
    if (process.env.SMOKE_VIEWPORT && name !== process.env.SMOKE_VIEWPORT)
      continue;
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.replayAudioAudit = {
        created: 0,
        started: 0,
        active: 0,
        maximum: 0,
        invalid: [],
        resumedFromGesture: [],
      };
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args);
          window.replayAudioAudit.created++;
        }
        resume() {
          window.replayAudioAudit.resumedFromGesture.push(
            navigator.userActivation.isActive,
          );
          return super.resume();
        }
        createBufferSource() {
          const source = super.createBufferSource(),
            start = source.start.bind(source),
            stop = source.stop.bind(source);
          const audit = window.replayAudioAudit;
          let active = false;
          const ended = () => {
            if (active) {
              active = false;
              audit.active--;
            }
          };
          source.addEventListener("ended", ended);
          source.start = (...args) => {
            if (this.state !== "running" || !source.buffer?.length)
              audit.invalid.push(this.state);
            active = true;
            audit.active++;
            audit.started++;
            audit.maximum = Math.max(audit.maximum, audit.active);
            return start(...args);
          };
          source.stop = (...args) => {
            ended();
            return stop(...args);
          };
          return source;
        }
      };
    });
    const page = await context.newPage();
    let ws = 0;
    const resources = [];
    page.on("websocket", () => ws++);
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("request", (r) => {
      if (r.url().includes("/replay/706-v1/")) resources.push(r.url());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page.getByRole("button", { name: "录像库", exact: true }).click();
    await expect(page.locator(".replay-page")).toBeVisible();
    assert.equal(
      resources.length,
      0,
      "Home/library must not download Core or Lua",
    );
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    assert.equal(resources.length, 0, "File import must not load Core");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载", exact: true }).click();
    const download = await downloadPromise;
    assert.deepEqual(
      readFileSync(await download.path()),
      readFileSync(fixture),
    );
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(
      page.locator(".replay-field-board,.replay-board,.replay-error").first(),
    ).toBeVisible({ timeout: 60000 });
    if (await page.locator(".replay-error").count())
      throw new Error(await page.locator(".replay-error").innerText());
    await expect(page.locator(".replay-negated")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "音效：开", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.evaluate(() => window.replayAudioAudit.created),
      0,
      "Opening a replay must not autoplay audio",
    );
    assert.equal(ws, 0, "Offline replay must not create a WebSocket");
    assert.deepEqual(
      await page
        .locator(".replay-field-player strong,.replay-side h2")
        .allTextContents(),
      ["ReplayFixtureA", "ReplayFixtureB"],
    );
    await page.getByRole("button", { name: "切换视角", exact: true }).click();
    assert.deepEqual(
      await page
        .locator(".replay-field-player strong,.replay-side h2")
        .allTextContents(),
      ["ReplayFixtureB", "ReplayFixtureA"],
    );
    await page.getByRole("button", { name: "单步", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("步骤 1");
    await page.locator(".replay-card").first().click();
    await expect(page.locator(".ant-drawer-open")).toBeVisible();
    await page
      .locator(".ant-drawer-open")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await expect(page.locator(".ant-drawer-open")).toHaveCount(0);
    await expect(
      page.locator(".replay-drawer .ant-drawer-content-wrapper").first(),
    ).toBeHidden();
    await page.locator('.ant-select[aria-label="播放速度"]').click();
    await page
      .locator(".ant-select-item-option")
      .filter({ hasText: /^16×$/ })
      .click();
    await page.getByRole("button", { name: "继续播放", exact: true }).click();
    await expect
      .poll(
        async () => {
          const progress = await page.locator(".replay-progress").innerText();
          return Number(progress.match(/步骤 (\d+)/)?.[1] || 0);
        },
        { timeout: 2000, intervals: [50] },
      )
      .toBeGreaterThanOrEqual(12);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await page.waitForTimeout(100);
    const pausedProgress = await page.locator(".replay-progress").innerText();
    await page.waitForTimeout(250);
    await expect(page.locator(".replay-progress")).toHaveText(pausedProgress);
    const audio = await page.evaluate(() => window.replayAudioAudit);
    assert.ok(
      audio.started > 0,
      "Replay must actually start decoded WAV audio buffers",
    );
    assert.equal(
      audio.created,
      1,
      "High-speed playback must reuse one AudioContext",
    );
    assert.ok(
      audio.maximum <= 4,
      "High-speed playback must bound simultaneous voices",
    );
    assert.equal(audio.active, 0, "Pause must stop every playing voice");
    assert.deepEqual(audio.invalid, []);
    assert.ok(
      audio.resumedFromGesture.every(Boolean),
      "Audio resume must be inside the user's click",
    );
    const soundCount = audio.started;
    await page.getByRole("button", { name: "音效：开", exact: true }).click();
    await page.getByRole("button", { name: "单步", exact: true }).click();
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => window.replayAudioAudit.started),
      soundCount,
      "Muted single step must be silent",
    );
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("步骤 0");
    await page.getByLabel("目标回合").fill("4");
    await page.getByRole("button", { name: "跳到回合", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("回合 4", {
      timeout: 30000,
    });
    assert.equal(
      await page.evaluate(() => window.replayAudioAudit.started),
      soundCount,
      "Restart and seek must not play skipped events",
    );
    await page.getByRole("button", { name: "操作记录", exact: true }).click();
    await expect(page.locator(".ant-drawer-open")).toBeVisible();
    await page
      .locator(".ant-drawer-open")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await expect(page.locator(".ant-drawer-open")).toHaveCount(0);
    await expect(
      page.locator(".replay-drawer .ant-drawer-content-wrapper").last(),
    ).toBeHidden();
    if (name === "desktop") {
      await page.waitForTimeout(11000);
      await expect(page.locator(".replay-error")).toHaveCount(0);
      await page.getByRole("button", { name: "单步", exact: true }).click();
      await expect(page.locator(".replay-progress")).not.toContainText(
        "步骤 0",
      );
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal page overflow",
    );
    await page.screenshot({
      path: `.audit-tmp/replay-ui/${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "退出播放", exact: true }).click();
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "音效：关", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "退出播放", exact: true }).click();
    assert.equal(ws, 0);
    if (name === "desktop") {
      const second = await context.newPage();
      await second.goto(origin + "/#/replays");
      await expect(second.locator(".replay-entry")).toHaveCount(1);
      await page.getByRole("button", { name: "删除", exact: true }).click();
      await page.locator(".ant-modal-confirm .ant-btn-primary").click();
      await expect(page.locator(".replay-entry")).toHaveCount(0);
      await expect(second.locator(".replay-entry")).toHaveCount(0);
      await second.close();
    }
    await context.close();
    console.log(
      `Replay UI ${name}: native playback, actual decoded audio, bounded voices, mute persistence, pause/restart/seek/view passed`,
    );
  }
  assert.deepEqual(errors, []);
  console.log("Replay browser checks passed, zero WSS connections.");
} finally {
  await browser.close();
}
