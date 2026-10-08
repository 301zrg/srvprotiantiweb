import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4174";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
mkdirSync(".audit-tmp/replay-state-ui", { recursive: true });
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["portrait", { width: 390, height: 844 }],
    ["narrow", { width: 320, height: 740 }],
    ["landscape", { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name !== "desktop",
      hasTouch: name !== "desktop",
    });
    await context.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.abort(),
    );
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      const card = (location, sequence, position, extra = {}) => ({
        code: 89631139,
        type: 1,
        attack: 3000,
        defense: 2500,
        level: 8,
        rank: 0,
        player: 0,
        location,
        sequence,
        position,
        overlay: [],
        counters: [],
        ...extra,
      });
      const frame = {
        names: ["StateFixtureA", "StateFixtureB"],
        lp: [8000, 8000],
        turn: 1,
        phase: 4,
        turnPlayer: 0,
        events: [],
        step: 0,
        consumed: 0,
        total: 10,
        cards: [
          card(4, 0, 1),
          card(4, 1, 4),
          card(4, 2, 8),
          card(4, 3, 2),
          card(8, 0, 8, {
            code: 43711255,
            type: 2,
            counters: [(3 << 16) | 1],
            status: 1,
            declared: 89631139,
          }),
          card(32, 0, 8),
          card(32, 1, 1),
          card(4, 0, 1, { player: 1, overlay: [46986414, 89631139] }),
          card(2, 0, 8),
        ],
      };
      window.Worker = class {
        onmessage;
        onerror;
        postMessage(data) {
          if (data.type === "close") return;
          if (data.type === "next") {
            frame.step++;
            frame.cards[1].position = 1;
            frame.cards[4].counters = [(1 << 16) | 1];
          }
          setTimeout(
            () =>
              this.onmessage?.({
                data: { type: "frame", frame: structuredClone(frame) },
              }),
            0,
          );
        }
        terminate() {}
      };
    });
    const page = await context.newPage();
    let sockets = 0;
    page.on("websocket", () => sockets++);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page.getByRole("link", { name: "录像列表", exact: true }).click();
    await expect(page.locator(".replay-page")).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/replay/native-deckout.yrp");
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(page.locator(".replay-field-board")).toBeVisible();
    await page.getByRole("button", { name: "列表视图", exact: true }).click();
    await expect(page.locator(".replay-board")).toBeVisible();
    const at = (location, sequence, player = 0) =>
      page.locator(
        `.replay-card[data-player="${player}"][data-location="${location}"][data-sequence="${sequence}"]`,
      );
    await expect(at(4, 0)).toContainText("攻击表示");
    await expect(at(4, 1)).toContainText("表侧 · 守备表示");
    await expect(at(4, 2)).toContainText("里侧 · 守备表示");
    await expect(at(4, 3)).toContainText("里侧 · 攻击表示");
    await expect(at(4, 2).locator("img")).toHaveAttribute(
      "src",
      /card_back\.jpg$/,
    );
    assert.notEqual(
      await at(4, 1)
        .locator("img")
        .evaluate((el) => getComputedStyle(el).transform),
      "none",
    );
    await expect(at(32, 0)).toContainText("里侧 · 除外");
    await expect(at(32, 0).locator("img")).toHaveAttribute(
      "src",
      /card_back\.jpg$/,
    );
    await expect(at(32, 1)).toContainText("表侧 · 除外");
    await expect(at(2, 0).locator("img")).not.toHaveAttribute(
      "src",
      /card_back\.jpg$/,
    );
    await expect(at(8, 0)).toContainText("盖放");
    await expect(at(8, 0)).toContainText("指示物 3");
    await expect(at(8, 0)).toContainText("效果无效");
    await expect(at(4, 0, 1)).toContainText("素材 2");
    await at(8, 0).click();
    await expect(page.locator(".ant-drawer-open")).toContainText(
      "魔力指示物 × 3",
    );
    await expect(page.locator(".ant-drawer-open")).toContainText("宣言卡片");
    await page
      .locator(".ant-drawer-open")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.getByRole("button", { name: "单步", exact: true }).click();
    await expect(at(4, 1)).toContainText("攻击表示");
    assert.equal(
      await at(4, 1)
        .locator("img")
        .evaluate((el) => getComputedStyle(el).transform),
      "none",
    );
    await expect(at(8, 0)).toContainText("指示物 1");
    await page
      .getByRole("button", { name: "查看里侧卡片", exact: true })
      .click();
    await expect(at(32, 0)).toContainText("里侧 · 除外");
    await expect(at(32, 0).locator("img")).not.toHaveAttribute(
      "src",
      /card_back\.jpg$/,
    );
    await expect(
      page.getByRole("button", { name: "查看里侧卡片", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No page overflow including navigation",
    );
    await page.screenshot({
      path: `.audit-tmp/replay-state-ui/${name}.png`,
      fullPage: true,
    });
    await page.getByRole("link", { name: "录像列表", exact: true }).click();
    await expect(page.locator(".replay-page")).toBeVisible();
    assert.equal(sockets, 0);
    await context.close();
    console.log(
      `Replay card states ${name}: face/back/defense/counters/materials/details/update/nav passed`,
    );
  }
  for (const [language, label] of [
    ["en", "Replays"],
    ["ja", "リプレイ"],
    ["ko", "리플레이"],
  ]) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      isMobile: true,
      hasTouch: true,
    });
    await context.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.abort(),
    );
    await context.addInitScript(
      (value) => localStorage.setItem("language", value),
      language,
    );
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page.locator(".replay-page")).toBeVisible();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `${language} navigation must fit narrow phone`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
