// Native sharing is stubbed; the real UI must preserve activation and YDK bytes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
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
    ["landscape", { width: 844, height: 390 }],
    ["narrow", { width: 320, height: 640 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name !== "desktop",
      hasTouch: name !== "desktop",
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
    page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    let downloads = 0;
    page.on("download", () => downloads++);
    await page.goto(origin + "/#/build", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("deck-name")).toHaveValue("1103-sample", {
      timeout: 60000,
    });
    const manage = async () => {
      if (name !== "desktop") await page.getByTestId("deck-tab-manage").click();
    };
    await manage();
    await page.locator('input[type="file"][accept*=".ydk"]').setInputFiles({
      name: "共享测试.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "#main\n69247929\n69247929\n43711255\n#extra\n44508094\n!side\n69247929\n",
      ),
    });
    await expect(page.getByTestId("deck-name")).toHaveValue("共享测试");
    await manage();
    const downloadButton = page.getByRole("button", {
      name: "下载 共享测试",
      exact: true,
    });
    const downloaded = page.waitForEvent("download");
    await downloadButton.click();
    const original = readFileSync(await (await downloaded).path());
    assert.match(
      original.toString(),
      /#main\n69247929\n69247929\n43711255\n#extra\n44508094\n!side\n69247929$/,
    );
    // Sharing a different saved row must not replace or save the editing draft.
    await page.locator('input[type="file"][accept*=".ydk"]').setInputFiles({
      name: "另一个卡组.ydk",
      mimeType: "text/plain",
      buffer: Buffer.from("#main\n43711255\n#extra\n!side\n"),
    });
    await expect(page.getByTestId("deck-name")).toHaveValue("另一个卡组");
    await page.getByTestId("deck-name").fill("未保存草稿");
    await manage();
    const share = page.getByRole("button", {
      name: "另存／分享 共享测试",
      exact: true,
    });
    await share.scrollIntoViewIfNeeded();
    const rect = await share.boundingBox();
    assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
    if (name !== "desktop") assert.ok(rect.width >= 44 && rect.height >= 44);
    await share.click();
    await expect
      .poll(() => page.evaluate(() => window.shareAudit.bytes.length))
      .toBe(original.length);
    const audit = await page.evaluate(() => window.shareAudit);
    assert.equal(
      audit.calls[0].active,
      true,
      "The share API must be invoked inside the click gesture",
    );
    assert.equal(audit.calls[0].name, "共享测试.ydk");
    assert.deepEqual(Buffer.from(audit.bytes), original);
    await expect(page.getByTestId("deck-name")).toHaveValue("未保存草稿");
    for (const mode of ["denied", "unsupported", "capability-error"]) {
      await page.evaluate((mode) => {
        window.shareAudit.mode = mode;
      }, mode);
      const event = page.waitForEvent("download");
      await share.click();
      assert.deepEqual(readFileSync(await (await event).path()), original);
      await expect(page.locator(".ant-message")).toContainText(
        "已改用 YDK 下载",
      );
    }
    const beforeCancel = downloads;
    await page.evaluate(() => {
      window.shareAudit.mode = "cancel";
    });
    await share.click();
    await page.waitForTimeout(300);
    assert.equal(
      downloads,
      beforeCancel,
      "Cancellation must not download a file",
    );
    await expect(page.getByTestId("deck-name")).toHaveValue("未保存草稿");
    console.log(
      `PASS ${name}: YDK bytes/order/duplicates, activation, denied/capability fallback, cancel, draft isolation, share target size`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
