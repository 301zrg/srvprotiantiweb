import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const fixture = "tests/fixtures/replay/native-deckout.yrp";
const original = readFileSync(fixture);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.shareAudit = {
        mode: "success",
        calls: [],
        bytes: [],
        downloads: 0,
      };
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => {
          if (window.shareAudit.mode === "capability-error")
            throw new DOMException("Permission denied", "NotAllowedError");
          return window.shareAudit.mode !== "unsupported";
        },
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data) => {
          const audit = window.shareAudit;
          audit.calls.push({
            active: navigator.userActivation.isActive,
            name: data.files[0].name,
          });
          if (audit.mode === "denied")
            return Promise.reject(
              new DOMException("Permission denied", "NotAllowedError"),
            );
          if (audit.mode === "cancel")
            return Promise.reject(new DOMException("Cancelled", "AbortError"));
          return data.files[0].arrayBuffer().then((bytes) => {
            audit.bytes = [...new Uint8Array(bytes)];
          });
        },
      });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("download", () =>
      page.evaluate(() => window.shareAudit.downloads++),
    );
    await page.goto(origin + "/#/replays", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".replay-page")).toBeVisible({ timeout: 45000 });
    await page.locator('input[type="file"]').setInputFiles(fixture);
    await expect(page.locator(".replay-entry")).toHaveCount(1);
    const shareButton = page.getByRole("button", {
      name: "另存／分享",
      exact: true,
    });
    await shareButton.click();
    await expect(page.locator(".ant-modal-confirm")).toContainText(
      "录像已准备好",
    );
    assert.equal(
      await page.evaluate(() => window.shareAudit.calls.length),
      0,
      "Reading the file must not invoke share before a fresh confirmation click",
    );
    await page.getByRole("button", { name: "分享文件", exact: true }).click();
    await expect(page.locator(".ant-modal-confirm")).toHaveCount(0);
    const shared = await page.evaluate(() => window.shareAudit);
    assert.equal(shared.calls.length, 1);
    assert.equal(
      shared.calls[0].active,
      true,
      "System share must retain transient user activation",
    );
    assert.deepEqual(
      Buffer.from(shared.bytes),
      original,
      "Sharing must preserve original YRP bytes",
    );
    for (const mode of ["denied", "unsupported", "capability-error"]) {
      await page.evaluate((mode) => {
        window.shareAudit.mode = mode;
      }, mode);
      const downloaded = page.waitForEvent("download");
      await shareButton.click();
      if (mode === "denied")
        await page
          .getByRole("button", { name: "分享文件", exact: true })
          .click();
      const download = await downloaded;
      assert.deepEqual(readFileSync(await download.path()), original);
      await expect(page.locator(".ant-message")).toContainText(
        "已改用文件下载",
      );
      await expect(page.locator(".replay-error")).toHaveCount(0);
    }
    await page.evaluate(() => {
      window.shareAudit.mode = "cancel";
    });
    await shareButton.click();
    await page.getByRole("button", { name: "分享文件", exact: true }).click();
    await expect(page.locator(".ant-modal-confirm")).toHaveCount(0);
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => window.shareAudit.downloads),
      3,
      "Cancelling a share must not start a download",
    );
    await expect(page.locator(".replay-error")).toHaveCount(0);
    console.log(
      JSON.stringify({
        mobile,
        sharing:
          "fresh gesture, exact bytes, denied/unsupported/capability fallback, cancellation passed",
      }),
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
