import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const systemEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (process.platform === "win32" && existsSync(systemEdge) ? systemEdge : undefined),
});
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const errors = [];
mkdirSync(".audit-tmp", { recursive: true });

try {
  for (const [name, viewport, isMobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["mobile", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ viewport, isMobile, hasTouch: isMobile });
    // This smoke scenario checks an unconfigured release, independently of local build settings.
    await context.route("**/duel-config.js", (route) => route.fulfill({
      contentType: "application/javascript",
      body: 'window.__SRVPRO_DUEL_CONFIG__ = { duelWebSocketUrl: "" };',
    }));
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    page.on("response", (response) => {
      if (
        response.url().startsWith(origin) &&
        response.status() >= 400
      ) errors.push(`${name}: HTTP ${response.status()} ${response.url()}`);
    });
    await page.addInitScript(() => localStorage.setItem("language", "cn"));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
    if (isMobile) {
      const layout = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      if (layout.viewport !== viewport.width || layout.page > viewport.width + 1) {
        throw new Error(`Mobile viewport or horizontal overflow: ${JSON.stringify(layout)}`);
      }
    }
    await expect(page.getByText("YGOPRO 1103 网页版")).toBeVisible();
    await page.screenshot({ path: `.audit-tmp/${name}-home.png`, fullPage: true });
    if (!isMobile) {
      for (const [label, code] of [
        ["English", "en"],
        ["日本語", "ja"],
        ["한국어", "ko"],
        ["简体中文", "cn"],
      ]) {
        await page.locator(".ant-select").first().click();
        await page
          .locator(".ant-select-dropdown:visible .ant-select-item-option")
          .filter({ hasText: label })
          .click();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("language")))
          .toBe(code);
      }
    }

    await page.getByRole("button", { name: "进入联机" }).click();
    await expect(page.locator("#player-nickname")).toBeVisible();
    await page.locator("#player-nickname").fill("测试玩家");
    await page.locator("#room-name").fill("TT");
    await expect(page.getByTestId("connect-submit")).toBeDisabled();
    await page.screenshot({ path: `.audit-tmp/${name}-match.png`, fullPage: true });

    await page.getByRole("button", { name: "编辑卡组" }).click();
    await expect(page.getByTestId("deck-name")).toHaveValue("1103-sample", { timeout: 15000 });
    if (isMobile) await page.getByTestId("deck-tab-manage").click();
    await expect(page.getByTestId("deck-import-file")).toBeVisible();
    if (isMobile) await page.getByTestId("deck-tab-deck").click();
    await page.screenshot({ path: `.audit-tmp/${name}-deck.png`, fullPage: true });
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Desktop/mobile smoke passed: home, fixed room form, 1103 sample deck");
} finally {
  await browser.close();
}
