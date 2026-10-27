import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { extractionFixture } from "./replay_extract_fixture.mjs";

const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const out = ".audit-tmp/replay-extract-ui";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  timeout: 20000,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
try {
  for (const [name, width, height] of [
    ["desktop", 1280, 800],
    ["portrait", 390, 844],
    ["landscape", 844, 390],
    ["narrow", 320, 640],
  ]) {
    if (process.env.SMOKE_VIEWPORT && name !== process.env.SMOKE_VIEWPORT)
      continue;
    const mobile = name !== "desktop";
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      localStorage.setItem(
        "__neo_setting_config__",
        JSON.stringify({
          audio: {
            enableSoundEffects: false,
            enableReplaySoundEffects: true,
            soundEffectsVolume: 0.7,
          },
        }),
      );
      window.extractShare = [];
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => true,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async ({ files }) => {
          const active = navigator.userActivation.isActive;
          window.extractShare.push({
            name: files[0].name,
            text: await files[0].text(),
            active,
          });
        },
      });
    });
    const page = await context.newPage(),
      resources = [],
      pendingRequests = new Set();
    page.setDefaultTimeout(20000);
    console.log(`Replay extraction UI starting ${name}`);
    let websockets = 0;
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    page.on("websocket", () => websockets++);
    page.on("request", (r) => {
      pendingRequests.add(r.url());
      if (r.url().includes("/replay/706-v1/")) resources.push(r.url());
    });
    page.on("requestfinished", (r) => pendingRequests.delete(r.url()));
    page.on("requestfailed", (r) => pendingRequests.delete(r.url()));
    await page.goto(origin + "/#/build", { waitUntil: "domcontentloaded" });
    try {
      await expect(page.getByTestId("deck-name")).toBeVisible({
        timeout: 60000,
      });
    } catch (error) {
      await page.screenshot({ path: `${out}/${name}-error.png` });
      console.log(await page.locator("body").innerText(), errors, [
        ...pendingRequests,
      ]);
      throw error;
    }
    await page.getByTestId("deck-name").fill("未保存的提取草稿");
    await page.evaluate(() => {
      location.hash = "/replays";
    });
    await expect(page.locator(".replay-page")).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "Ordered.yrp",
      mimeType: "application/octet-stream",
      buffer: extractionFixture(),
    });
    const row = page.locator(".replay-entry").filter({
      has: page.getByRole("heading", { name: "Ordered", exact: true }),
    });
    await row.getByRole("button", { name: "提取卡组", exact: true }).click();
    const panel = page
      .locator(".replay-deck-extract")
      .filter({ visible: true });
    await expect(
      panel.getByText("录像不包含备牌。", { exact: false }),
    ).toBeVisible();
    await expect(panel.locator(".replay-extracted-deck")).toHaveCount(2);
    await expect(panel.locator(".replay-extracted-deck").first()).toContainText(
      "主卡组 3 / 额外 2",
    );
    const download = panel
      .locator(".replay-extracted-deck")
      .first()
      .getByRole("button", { name: "下载 YDK", exact: true });
    if (mobile) {
      await download.scrollIntoViewIfNeeded();
      const touchTarget = await download.boundingBox();
      assert.ok(
        touchTarget.width >= 44 && touchTarget.height >= 44,
        "Extraction exports keep a 44px touch target, including landscape",
      );
      await download.click();
      await expect
        .poll(() => page.evaluate(() => window.extractShare.length))
        .toBe(1);
      const [shared] = await page.evaluate(() => window.extractShare);
      assert.equal(
        shared.active,
        true,
        "Share receives the original click activation",
      );
      assert.match(
        shared.text,
        /#main\n999999999\n123\n999999999\n#extra\n456\n321\n!side$/,
      );
    } else {
      const pending = page.waitForEvent("download");
      await download.click();
      const file = await pending;
      assert.match(
        readFileSync(await file.path(), "utf8"),
        /#main\n999999999\n123\n999999999\n#extra\n456\n321\n!side$/,
      );
    }
    await panel
      .getByRole("button", { name: "保存到我的卡组", exact: true })
      .first()
      .click();
    await expect(page.locator(".ant-message")).toContainText("Ordered - Alpha");
    // The second IDB write fails after the first player was really persisted.
    await page.evaluate(() => {
      window.extractNativeAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (value, key) {
        if (value?.deckName === "Ordered - Beta")
          throw new DOMException("Synthetic quota fault", "QuotaExceededError");
        return window.extractNativeAdd.call(this, value, key);
      };
    });
    await panel
      .getByRole("button", { name: "保存双方卡组", exact: true })
      .click();
    await expect(page.locator(".ant-message")).toContainText("卡组保存失败");
    await expect(panel.locator(".replay-extract-saved").first()).toContainText(
      "Ordered - Alpha (2)",
    );
    await expect(page.locator(".ant-message")).not.toContainText(
      "已保存双方卡组",
    );
    await page.evaluate(() => {
      IDBObjectStore.prototype.add = window.extractNativeAdd;
    });
    await panel
      .getByRole("button", { name: "保存双方卡组", exact: true })
      .click();
    await expect(page.locator(".ant-message")).toContainText("已保存双方卡组");
    await panel.screenshot({ path: `${out}/${name}.png` });
    await page.screenshot({ path: `${out}/${name}-page.png` });
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await panel
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    await expect(panel).toBeHidden();
    assert.equal(
      resources.length,
      0,
      "Uncompressed extraction loads no runtime",
    );
    await page.evaluate(() => {
      location.hash = "/build";
    });
    await expect(page.getByTestId("deck-name")).toHaveValue("未保存的提取草稿");
    if (mobile) await page.getByTestId("deck-tab-manage").click();
    await expect(
      page.getByRole("button", {
        name: "下载 Ordered - Alpha (2)",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "下载 Ordered - Beta", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      location.hash = "/replays";
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles(resolve("tests/fixtures/replay/native-deckout.yrp"));
    const native = page.locator(".replay-entry").filter({
      has: page.getByRole("heading", { name: "native-deckout", exact: true }),
    });
    await native.getByRole("button", { name: "提取卡组", exact: true }).click();
    await expect(panel.locator(".replay-extracted-deck")).toHaveCount(2, {
      timeout: 60000,
    });
    await expect(panel.locator(".replay-extracted-deck").first()).toContainText(
      "主卡组 40 / 额外 0",
    );
    assert.ok(resources.some((r) => r.endsWith("ocgcore.wasm")));
    assert.ok(
      resources.every((r) => /ocgcore\.(js|wasm)$/.test(r)),
      "Extraction requests verified JS/WASM only",
    );
    assert.equal(websockets, 0);
    await panel
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    if (name === "desktop") {
      const unsupported = extractionFixture();
      unsupported.writeUInt32LE(0x9999, 4);
      const corrupt = Buffer.from(
        readFileSync("tests/fixtures/replay/native-deckout.yrp"),
      );
      corrupt.fill(0, 80);
      for (const [filename, bytes, reason] of [
        ["Unsupported", unsupported, "暂不支持从此格式的录像提取卡组"],
        ["Corrupt", corrupt, "无法提取卡组"],
      ]) {
        await page.locator('input[type="file"]').setInputFiles({
          name: filename + ".yrp",
          mimeType: "application/octet-stream",
          buffer: bytes,
        });
        await page
          .locator(".replay-entry")
          .filter({
            has: page.getByRole("heading", { name: filename, exact: true }),
          })
          .getByRole("button", { name: "提取卡组", exact: true })
          .click();
        await expect(panel.getByRole("alert")).toContainText(reason, {
          timeout: 60000,
        });
        await expect(panel.locator(".replay-extracted-deck")).toHaveCount(0);
        await expect(
          panel.getByRole("button", { name: "保存双方卡组", exact: true }),
        ).toBeDisabled();
        await panel
          .getByRole("button", { name: "关闭", exact: true })
          .last()
          .click();
      }
    }
    await native.getByRole("button", { name: "播放", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "音效：关", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "音效：关", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "音效：开", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("__neo_setting_config__")).audio
              .enableSoundEffects,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "音效：开", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("__neo_setting_config__")).audio
              .enableSoundEffects,
        ),
      )
      .toBe(false);
    await page.getByTestId("open-settings").click();
    await page.getByTestId("shared-sound-setting").click();
    await page.getByTestId("settings-close").click();
    await expect(
      page.getByRole("button", { name: "音效：开", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "提取卡组", exact: true }).click();
    await expect(panel.locator(".replay-extracted-deck")).toHaveCount(2, {
      timeout: 60000,
    });
    await panel
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    await context.close();
    console.log(`Replay extraction UI PASS ${name}`);
  }
  if (!process.env.SMOKE_VIEWPORT) {
    for (const [language, extract, counts, close] of [
      ["en", "Extract decks", "Main 3 / Extra 2", "Close"],
      ["ja", "デッキを抽出", "メイン 3 / EX 2", "閉じる"],
      ["ko", "덱 추출", "메인 3 / 엑스트라 2", "닫기"],
    ]) {
      const context = await browser.newContext({
        viewport: { width: 320, height: 640 },
        isMobile: true,
        hasTouch: true,
      });
      await context.addInitScript(
        (language) => localStorage.setItem("language", language),
        language,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on("pageerror", (e) => errors.push(`${language}: ${e.message}`));
      await page.goto(origin + "/#/replays", { waitUntil: "domcontentloaded" });
      await page.locator('input[type="file"]').setInputFiles({
        name: "Ordered.yrp",
        mimeType: "application/octet-stream",
        buffer: extractionFixture(),
      });
      await page.getByRole("button", { name: extract, exact: true }).click();
      const panel = page
        .locator(".replay-deck-extract")
        .filter({ visible: true });
      await expect(
        panel.locator(".replay-extracted-deck").first(),
      ).toContainText(counts);
      const bounds = await panel.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 321);
      await panel.screenshot({ path: `${out}/narrow-${language}.png` });
      await panel
        .getByRole("button", { name: close, exact: true })
        .last()
        .click();
      await context.close();
      console.log(`Replay extraction UI PASS narrow ${language}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
