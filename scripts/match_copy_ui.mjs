import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const words = {
  zh: { nickname: "复制玩家昵称", room: "复制房间号", copied: "已复制", failed: "复制失败", invite: "请将房间号发给朋友" },
  en: { nickname: "Copy nickname", room: "Copy room name", copied: "Copied", failed: "Could not copy", invite: "send your room name to a friend" },
  ja: { nickname: "プレイヤー名をコピー", room: "ルーム名をコピー", copied: "コピーしました", failed: "コピーできませんでした", invite: "ルーム名を友達に送って" },
  ko: { nickname: "플레이어 이름 복사", room: "방 이름 복사", copied: "복사했습니다", failed: "복사하지 못했습니다", invite: "방 이름을 친구에게 보내" },
};
const profiles = [
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "portrait", width: 390, height: 844, mobile: true },
  { name: "landscape", width: 844, height: 390, mobile: true },
];
const reports = [];
let server, browser;
try {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  mkdirSync(".audit-tmp", { recursive: true });
  for (const profile of profiles) {
    const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, isMobile: profile.mobile, hasTouch: profile.mobile });
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    // Never read or overwrite the developer's real operating-system clipboard.
    await context.addInitScript(() => {
      const capture = window.__clipboardTest = { requests: [], writes: [], deny: false };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        async writeText(text) {
          capture.requests.push(text);
          if (capture.deny) throw new DOMException("Denied fixture", "NotAllowedError");
          capture.writes.push(text);
        },
      } });
    });
    const page = await context.newPage(), errors = [];
    let sockets = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", () => sockets++);
    for (const [lang, text] of Object.entries(words)) {
      await page.goto(`${origin}?lang=${lang}#/match`);
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      const nickname = page.locator("#player-nickname"), room = page.locator("#room-name");
      const copyNickname = page.getByTestId("copy-nickname"), copyRoom = page.getByTestId("copy-room-name");
      await expect(copyNickname).toHaveAttribute("aria-label", text.nickname);
      await expect(copyRoom).toHaveAttribute("aria-label", text.room);
      await expect(page.locator("#room-hint")).toContainText(text.invite);
      await nickname.fill(""); await room.fill("");
      await expect(copyNickname).toBeDisabled(); await expect(copyRoom).toBeDisabled();
      await nickname.fill("$abc"); await room.fill("   $xyz");
      await expect(copyNickname).toBeDisabled(); await expect(copyRoom).toBeDisabled();
      const nickInput = "Copy用户$abc", roomInput = " M#友達 1 $xyz";
      await nickname.fill(nickInput); await room.fill(roomInput);
      await copyNickname.click(); await expect(page.locator(".ant-message")).toContainText(text.copied);
      await copyRoom.click(); await expect(page.locator(".ant-message")).toContainText(text.copied);
      assert.deepEqual(await page.evaluate(() => window.__clipboardTest.writes), ["Copy用户", " M#友達 1 "]);
      await expect(nickname).toHaveValue(nickInput); await expect(room).toHaveValue(roomInput);
      if (profile.mobile) {
        assert.ok((await copyNickname.boundingBox()).height >= 44);
        assert.ok((await copyRoom.boundingBox()).height >= 44);
      }
      await page.evaluate(() => { window.__clipboardTest.deny = true; });
      await copyRoom.click(); await expect(page.locator(".ant-message")).toContainText(text.failed);
      assert.equal(await page.evaluate(() => window.__clipboardTest.requests.at(-1)), " M#友達 1 ");
      assert.equal(await page.evaluate(() => window.__clipboardTest.writes.length), 2);
      // Reset the feedback to success so a stale rejection toast cannot make
      // the missing-API check pass without a fresh failure notification.
      await page.evaluate(() => { window.__clipboardTest.deny = false; });
      await copyNickname.click(); await expect(page.locator(".ant-message")).toContainText(text.copied);
      await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
      await copyNickname.click(); await expect(page.locator(".ant-message")).toContainText(text.failed);
      assert.equal(await page.evaluate(() => window.__clipboardTest.writes.length), 3);
      await expect(nickname).toHaveValue(nickInput); await expect(room).toHaveValue(roomInput);
      await page.locator('label[for="player-nickname"]').click(); await expect(nickname).toBeFocused();
      await page.getByTestId("connect-submit").scrollIntoViewIfNeeded();
      await expect(page.getByTestId("connect-submit")).toBeInViewport();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      if (lang === "zh") await page.screenshot({ path: `.audit-tmp/match-copy-${profile.name}.png` });
      reports.push({ profile: profile.name, lang, publicValuesOnly: true, rejectionAndMissingApiHandled: true });
    }
    assert.equal(sockets, 0); assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ reports, realClipboardUntouched: true, onlineConnections: 0, realPhoneTested: false }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
