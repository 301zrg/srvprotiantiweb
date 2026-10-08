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
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    const page = await context.newPage();
    let ws = 0;
    const resources = [];
    page.on("websocket", () => ws++);
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("request", (r) => {
      if (r.url().includes("/replay/706-v1/")) resources.push(r.url());
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
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
    await page.reload();
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(
      page.locator(".replay-field-board,.replay-board,.replay-error").first(),
    ).toBeVisible({ timeout: 60000 });
    if (await page.locator(".replay-error").count())
      throw new Error(await page.locator(".replay-error").innerText());
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
    await page.getByRole("button", { name: "重新开始", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("步骤 0");
    await page.getByLabel("目标回合").fill("4");
    await page.getByRole("button", { name: "跳到回合", exact: true }).click();
    await expect(page.locator(".replay-progress")).toContainText("回合 4", {
      timeout: 30000,
    });
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
      `Replay UI ${name}: import/download/refresh/play/step/restart/seek/view/close passed`,
    );
  }
  assert.deepEqual(errors, []);
  console.log("Replay browser checks passed, zero WSS connections.");
} finally {
  await browser.close();
}
