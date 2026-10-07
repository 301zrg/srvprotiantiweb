import assert from "node:assert/strict";
import { cpSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

// This endpoint is intercepted in the page before the application starts.
process.env.VITE_DUEL_WS_URL = "wss://local-client-test.invalid/neos";
process.env.VITE_BASE_PATH = "/";
const outDir = ".audit-tmp/mock-dist";

const systemEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let browser;
let vite;
try {
  await build({ build: { outDir } });
  const assetsRoot = resolve("neos-assets");
  cpSync("neos-assets", join(outDir, "neos-assets"), {
    recursive: true,
    filter(source) {
      const parts = relative(assetsRoot, resolve(source)).split(sep);
      return parts[0] !== "deck-cases" && !(parts[0] === "sound" && parts[1] === "BGM");
    },
  });
  vite = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (process.platform === "win32" && existsSync(systemEdge) ? systemEdge : undefined),
  });
  const origin = vite.resolvedUrls.local[0];

  for (const scenario of [
    { name: "ladder-mobile", nickname: "测试玩家$abc", room: "TT", mode: 1, mobile: true },
    { name: "private-desktop", nickname: "player", room: "友谊房$pw", mode: 0, mobile: false, runtimeUrl: "wss://operator-config-test.invalid/neos" },
  ]) {
    const context = await browser.newContext({
      viewport: scenario.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: scenario.mobile,
      hasTouch: scenario.mobile,
    });
    const page = await context.newPage();
    if (scenario.runtimeUrl) {
      await context.route("**/duel-config.js", (route) => route.fulfill({
        contentType: "application/javascript",
        body: `window.__SRVPRO_DUEL_CONFIG__ = ${JSON.stringify({ duelWebSocketUrl: scenario.runtimeUrl })};`,
      }));
    }
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.__mockDuel = { urls: [], packets: [], closed: 0 };
      window.__mockSockets = [];
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        binaryType = "blob";

        constructor(url) {
          this.url = url;
          window.__mockDuel.urls.push(url);
          window.__mockSockets.push(this);
          setTimeout(() => {
            if (this.readyState !== 0) return;
            this.readyState = 1;
            this.onopen?.(new Event("open"));
          }, 0);
        }

        send(value) {
          const packet = Array.from(new Uint8Array(value));
          window.__mockDuel.packets.push(packet);
          if (packet[2] !== 18) return;
          const pass = new TextDecoder("utf-16le")
            .decode(new Uint8Array(packet.slice(11, 51)))
            .split("\0")[0];
          if (pass === "BUSY") {
            const reason = "[Server]: 服务器已爆满\0";
            const chat = new Uint8Array(5 + reason.length * 2);
            new DataView(chat.buffer).setUint16(0, chat.length - 2, true);
            chat[2] = 25;
            for (let i = 0; i < reason.length; i++) {
              new DataView(chat.buffer).setUint16(5 + i * 2, reason.charCodeAt(i), true);
            }
            const error = new Uint8Array(11);
            const errorView = new DataView(error.buffer);
            errorView.setUint16(0, 9, true);
            error[2] = 2;
            errorView.setUint32(3, 1, true);
            errorView.setUint32(7, 9, true);
            setTimeout(() => {
              this.onmessage?.(new MessageEvent("message", { data: chat.buffer }));
              this.onmessage?.(new MessageEvent("message", { data: error.buffer }));
              this.onerror?.(new Event("error"));
              this.close();
            }, 0);
            return;
          }
          const host = new Uint8Array(20);
          const view = new DataView(host.buffer);
          view.setUint32(0, 0x73ec4051, true);
          view.setUint8(4, 1);
          view.setUint8(5, pass === "TT" ? 1 : 0);
          view.setUint8(6, 2);
          view.setInt32(12, 8000, true);
          view.setUint8(16, 5);
          view.setUint8(17, 1);
          view.setUint16(18, 180, true);
          const reply = new Uint8Array(23);
          new DataView(reply.buffer).setUint16(0, 21, true);
          reply[2] = 18;
          reply.set(host, 3);
          setTimeout(() => {
            this.onmessage?.(new MessageEvent("message", { data: reply.buffer }));
          }, 0);
        }

        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          window.__mockDuel.closed += 1;
          this.onclose?.(new CloseEvent("close", { code: 1000 }));
        }
      }
      window.WebSocket = MockWebSocket;
    });

    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
    await page.getByRole("button", { name: "进入联机" }).click();
    await page.locator("#player-nickname").fill(scenario.nickname);
    await page.locator("#room-name").fill(scenario.room);
    await page.getByTestId("connect-submit").click();
    const host = page.getByTestId("room-host-info");
    await expect(host).toBeVisible({ timeout: 15000 });
    await expect(host).toContainText(scenario.mode === 1 ? "Mode: Match" : "Mode: Single");
    await expect(host).toContainText("LF: 0x73ec4051");

    const state = await page.evaluate(() => ({
      ...window.__mockDuel,
      storage: { ...localStorage },
      tabStorage: { ...sessionStorage },
    }));
    assert.deepEqual(state.urls, [scenario.runtimeUrl || "wss://local-client-test.invalid/neos"]);
    const player = state.packets.find((packet) => packet[2] === 16);
    const join = state.packets.find((packet) => packet[2] === 18);
    assert.ok(player && join, `${scenario.name}: initial packets missing`);
    assert.equal(player.length, 43);
    assert.equal(join.length, 51);
    assert.equal(new DataView(Uint8Array.from(join).buffer).getUint16(3, true), 0x1362);
    const decode = (packet, start) =>
      new TextDecoder("utf-16le")
        .decode(Uint8Array.from(packet.slice(start, start + 40)))
        .split("\0")[0];
    assert.equal(decode(player, 3), scenario.nickname);
    assert.equal(decode(join, 11), scenario.room);
    assert.ok(!JSON.stringify(state.storage).includes("$abc"));
    assert.ok(!JSON.stringify(state.storage).includes("$pw"));
    assert.ok(!JSON.stringify(state.tabStorage).includes(scenario.nickname));
    assert.ok(!JSON.stringify(state.tabStorage).includes(scenario.room));
    assert.equal(errors.length, 0, `${scenario.name}: ${errors.join("; ")}`);
    if (scenario.name === "ladder-mobile") {
      await page.locator("button").filter({ hasText: "退出房间" }).first().click();
      await expect(page.locator("#room-name")).toBeVisible();
      await expect(page.locator("#player-nickname")).toHaveValue(scenario.nickname);
      await expect(page.locator("#room-name")).toHaveValue(scenario.room);
      await page.locator("#player-nickname").fill("again");
      await page.locator("#room-name").fill("new-room");
      await page.getByTestId("connect-submit").click();
      await expect(page.getByTestId("room-host-info")).toContainText("Mode: Single");
      await page.evaluate(() => {
        const frame = new Uint8Array(23);
        new DataView(frame.buffer).setUint16(0, 21, true);
        frame[2] = 18;
        frame[8] = 2;
        window.__mockSockets[0].onmessage?.(
          new MessageEvent("message", { data: frame.buffer }),
        );
      });
      await page.waitForTimeout(100);
      await expect(page.getByTestId("room-host-info")).toContainText("LF: 0x73ec4051");
      const replaced = await page.evaluate(() => window.__mockDuel);
      assert.equal(replaced.closed, 1);
      assert.equal(replaced.urls.length, 2);

      const opponent = await context.newPage();
      await opponent.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(opponent.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      await opponent.getByRole("button", { name: "进入联机" }).click();
      await opponent.locator("#player-nickname").fill("other$secret");
      await opponent.locator("#room-name").fill("new-room");
      await opponent.getByTestId("connect-submit").click();
      await expect(opponent.getByTestId("room-host-info")).toBeVisible();

      const ownDeck = { deckName: "own", main: [69247929], extra: [], side: [] };
      const opponentDeck = {
        deckName: "opponent",
        main: [11091375, 14898066],
        extra: [],
        side: [],
      };
      await page.evaluate((deck) => sessionStorage.setItem("side_deck", JSON.stringify(deck)), ownDeck);
      await opponent.evaluate((deck) => {
        sessionStorage.setItem("side_deck", JSON.stringify(deck));
        localStorage.setItem("side_deck", JSON.stringify(deck));
      }, opponentDeck);
      await page.evaluate(() => { location.hash = "#/side"; });
      await opponent.evaluate(() => { location.hash = "#/side"; });
      await expect(page.locator("body")).toContainText("MAIN: 1");
      await expect(opponent.locator("body")).toContainText("MAIN: 2");
      await page.evaluate(() => { location.hash = "#/match"; });
      await opponent.evaluate(() => { location.hash = "#/match"; });
      await expect(page.locator("#player-nickname")).toHaveValue("again");
      await expect(opponent.locator("#player-nickname")).toHaveValue("other$secret");
      await opponent.close();
    } else {
      await page.locator("button").filter({ hasText: "退出房间" }).first().click();
      await page.locator("#room-name").fill("BUSY");
      await page.getByTestId("connect-submit").click();
      await expect(
        page.locator('[role="alert"]').filter({ hasText: "服务器已爆满" }).first(),
      ).toBeVisible();
      await page.locator("#room-name").fill("after-busy");
      await page.getByTestId("connect-submit").click();
      await expect(page.getByTestId("room-host-info")).toBeVisible();
    }
    await context.close();
  }
  console.log("Mock duel handshake passed: raw nickname/room packets, TT and ordinary HostInfo, mobile wait room");
} finally {
  await browser?.close();
  if (vite) await new Promise((resolve) => vite.httpServer.close(resolve));
}
