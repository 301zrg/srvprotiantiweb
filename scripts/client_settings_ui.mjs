// Synthetic local transport; no live account or production socket.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const folder = ".audit-tmp/client-settings";
mkdirSync(folder, { recursive: true });
const only = process.argv.find(arg => arg.startsWith("--"))?.replace(/^--|\-only$/g, "");
let vite, browser;
try {
  vite = await createServer({ cacheDir: `.audit-tmp/client-settings-vite-cache-${only ?? "all"}`, server: { host: "127.0.0.1", port: 0 } });
  await vite.listen();
  console.log("Temporary settings browser server listening.");
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({ headless: true, executablePath: existsSync(edge) ? edge : undefined });
  const profile = process.argv.find(arg => arg.startsWith("--profile="))?.slice("--profile=".length);
  const profiles = (only === "sidebar" ? [["desktop", 1440, 900, false], ["landscape", 844, 390, true], ["short", 568, 320, true]] : [["desktop", 1280, 800, false], ["portrait", 390, 844, true], ["narrow", 320, 640, true]]).filter(([name]) => !profile || name === profile);
  assert.ok(profiles.length, "Unknown browser profile");
  for (const [name, width, height, touch] of profiles) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    const origin = vite.resolvedUrls.local[0];
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort("blockedbyclient"));
    await context.route("**/duel-config.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};' }));
    await context.addInitScript(() => localStorage.setItem("language", "en"));
    const page = await context.newPage();
    const errors = [];
    const failedRequests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("console", event => { if (event.type() === "error" && !event.text().includes("net::ERR_BLOCKED_BY_CLIENT")) console.error(`${name} console: ${event.text()}`); });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    try {
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
    } catch (error) {
      console.error(`${name} startup errors:`, errors, failedRequests.filter(request => request.url.startsWith(origin)), (await page.locator("body").innerText()).slice(0, 1200));
      throw error;
    }
    await page.evaluate(async () => {
      const { initUIContainer } = await import("/src/container/compat.ts");
      const stores = await import("/src/stores/index.ts");
      const { settingStore } = await import("/src/stores/settingStore/index.ts");
      const { connectionStore } = await import("/src/variant/connection.ts");
      window.__settingsTest = { ...stores, settingStore, connectionStore, sent: [] };
      initUIContainer({ ws: { readyState: 1, send(bytes) { window.__settingsTest.sent.push([...new Uint8Array(bytes.buffer ?? bytes)]); } } });
    });
    if (!only || only === "settings") {
      await page.evaluate(async () => (await import("/src/ui/Setting/index.tsx")).openSettingPanel({ defaultKey: "operations" }));
      await expect(page.getByTestId("settings-navigation")).toHaveCount(touch ? 0 : 1);
      for (const group of touch ? ["operations", "audio", "display", "language"] : ["operations"]) {
        await expect(page.getByTestId(`settings-section-${group}`)).toBeVisible();
      }
      await page.getByTestId("setting-chain-0").check();
      await expect.poll(() => page.evaluate(() => window.__settingsTest.matStore.chainSetting)).toBe(0);
      await page.evaluate(() => { window.__settingsTest.matStore.chainSetting = 1; });
      await expect(page.getByTestId("setting-chain-1")).toBeChecked();
      await expect.poll(() => page.evaluate(() => window.__settingsTest.settingStore.chainSetting)).toBe(1);
      await page.getByTestId("setting-random-rps-play").check();
      await page.getByTestId("duel-diagnostics-open").isVisible().then(visible => assert.equal(visible, false, "Diagnostics should be folded by default"));
      await page.getByText("Troubleshooting", { exact: true }).click();
      await page.getByTestId("duel-diagnostics-open").click();
      await expect(page.getByTestId("duel-diagnostics-report")).toBeVisible();
      await page.screenshot({ path: `${folder}/${name}-settings.png` });
      if (touch) await page.getByTestId("settings-close").click();
      else await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("__neo_setting_config__")).chainSetting), 1);
    }
    if (!only || only === "rps") {
      await page.evaluate(async () => {
        const { roomStore, settingStore } = window.__settingsTest;
        settingStore.randomRpsMode = "suggest";
        roomStore.players = [{ name: "Local", isMe: true, state: 1 }, { name: "Opponent", isMe: false, state: 1 }];
        roomStore.selfType = 0;
        roomStore.joined = true;
        roomStore.stage = 2;
        location.hash = "#/waitroom";
      });
      await expect(page.getByTestId("waitroom")).toBeVisible();
      const request = async () => page.evaluate(async () => { const { eventbus, Task } = await import("/src/infra/eventbus.ts"); eventbus.emit(Task.Mora); });
      await request();
      await page.getByTestId("waitroom-random-rps").click();
      await expect(page.getByTestId("waitroom-rps-suggestion")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 0, "Suggest-only click sent a packet");
      await request();
      await expect(page.getByTestId("waitroom-rps-suggestion")).toHaveCount(0);
      await page.evaluate(() => { window.__settingsTest.settingStore.randomRpsMode = "play"; });
      await page.getByTestId("waitroom-random-rps").click({ clickCount: 2 });
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 1, "One random play must submit exactly once");
      const handPacket = await page.evaluate(() => window.__settingsTest.sent[0]);
      assert.equal(handPacket.at(-2), 3);
      assert.ok([1, 2, 3].includes(handPacket.at(-1)));
      await page.evaluate(() => { window.__settingsTest.roomStore.stage = 2; });
      await request();
      await page.evaluate(() => { window.__settingsTest.connectionStore.epoch++; });
      await expect(page.getByTestId("waitroom-random-rps")).toHaveCount(0);
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 1, "Reconnect resent an old response");
      await page.evaluate(async () => {
        window.__settingsTest.settingStore.randomRpsMode = "suggest";
        location.hash = "#/duel";
      });
      await expect(page.getByTestId("duel-menu")).toBeVisible();
      await page.evaluate(async () => { const effect = await import("/src/service/duel/rockPaperScissors.ts"); void effect.default({ player: 0 }); });
      await page.getByTestId("effect-random-rps").click();
      await expect(page.getByTestId("effect-rps-suggestion")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 1);
      await page.evaluate(() => { window.__settingsTest.settingStore.randomRpsMode = "play"; });
      await page.getByTestId("effect-random-rps").click({ clickCount: 2 });
      await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 2);
      const effectPacket = await page.evaluate(() => window.__settingsTest.sent[1]);
      assert.equal(effectPacket.length, 7, "Effect RPS must use the existing 32-bit response packet");
      assert.deepEqual(effectPacket.slice(0, 3), [5, 0, 1]);
      assert.ok([1, 2, 3].includes(effectPacket[3]), "Effect hand mapping changed");
      assert.deepEqual(effectPacket.slice(4), [0, 0, 0]);
      await page.evaluate(async () => { const effect = await import("/src/service/duel/rockPaperScissors.ts"); void effect.default({ player: 0 }); });
      await expect(page.getByTestId("effect-random-rps")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 2, "A new request must not auto-submit in play mode");
      await page.evaluate(() => { window.__settingsTest.connectionStore.epoch++; });
      await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 2, "Reconnect must cancel effect RPS without sending a response");
    }
    if (!only || only === "messages") {
      await page.evaluate(() => { window.__settingsTest.settingStore.serverMessageMode = "auto"; location.hash = "#/duel"; });
      await expect(page.getByTestId("duel-menu")).toBeVisible();
      await page.evaluate(() => { const { chatStore } = window.__settingsTest; chatStore.sender = 8; chatStore.message = "Ordinary system notice"; });
      if (touch) {
        await expect(page.getByTestId("duel-message-summary")).toContainText("Ordinary system notice");
        await expect(page.locator(".ant-notification-notice")).toHaveCount(0);
        await page.getByTestId("duel-message-summary").click();
        await expect(page.getByTestId("duel-chat-panel")).toContainText("Ordinary system notice");
        await page.evaluate(() => { window.__settingsTest.chatStore.message = "Already reading this chat"; });
        await expect(page.getByTestId("duel-chat-panel")).toContainText("Already reading this chat");
        await expect(page.getByTestId("duel-message-summary")).toHaveCount(0);
        await page.getByTestId("duel-chat-panel-close").click();
      } else {
        await expect(page.locator(".ant-notification-notice")).toContainText("Ordinary system notice");
      }
      // Let earlier toasts (e.g. the RPS "Played" notice) expire first.
      await expect(page.locator(".ant-message-notice")).toHaveCount(0, { timeout: 10000 });
      await page.evaluate(() => { window.__settingsTest.matStore.phase.currentPhase = 4; });
      await page.waitForTimeout(100);
      await expect(page.locator(".ant-message-notice")).toHaveCount(0);
      await page.evaluate(() => { window.__settingsTest.settingStore.serverMessageMode = "record"; window.__settingsTest.chatStore.message = "Record only notice"; });
      await expect(page.locator(".ant-notification-notice")).toHaveCount(0);
      await expect(page.getByTestId("duel-message-summary")).toHaveCount(0);
      await page.evaluate(() => { window.__settingsTest.matStore.error = "Critical duel error"; });
      await expect(page.locator(".ant-message-notice")).toContainText("Critical duel error");
    }
    if (only === "sidebar") {
      await page.evaluate(() => {
        const { matStore, roomStore } = window.__settingsTest;
        matStore.selfType = 1;
        matStore.currentPlayer = 0;
        matStore.turnCount = 3;
        matStore.phase.currentPhase = 4;
        matStore.initInfo.me.life = 8000;
        matStore.initInfo.op.life = 7000;
        roomStore.players = [{ name: "Local player", isMe: true, state: 1 }, { name: "Opponent", isMe: false, state: 1 }];
        location.hash = "#/duel";
      });
      const rail = page.getByTestId("duel-sidebar");
      await expect(rail).toBeVisible();
      await expect(rail.getByTestId("duel-history-content")).toBeVisible();
      const rect = await rail.boundingBox();
      for (const life of await page.getByTestId("duel-player-life").all()) {
        const lifeRect = await life.boundingBox();
        assert.ok(lifeRect.x >= rect.x && lifeRect.x + lifeRect.width <= rect.x + rect.width + 1, "Life display escaped the reserved rail");
      }
      await expect(rail.getByTestId("duel-turn-status")).toContainText("3");
      await page.evaluate(async () => {
        const { ygopro } = await import("/src/api/index.ts");
        const { matStore } = window.__settingsTest;
        matStore.selfType = ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
        matStore.observerSwapped = true;
      });
      await expect(rail.getByTestId("duel-turn-status")).toContainText("Opponent");
      await page.evaluate(() => { window.__settingsTest.matStore.selfType = 1; window.__settingsTest.matStore.observerSwapped = false; });
      for (const id of ["duel-phase-select", "duel-chain-setting", "duel-settings"]) {
        await expect.poll(() => page.getByTestId(id).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        }), { message: `${name}: key control ${id} requires scrolling or is covered` }).toBe(true);
      }
      await rail.getByTestId("duel-chat-tab").click();
      await expect(page.getByTestId("duel-chat-panel")).toBeVisible();
      await rail.getByTestId("duel-history-tab").click();
      await page.evaluate(async () => {
        const { showCardModal } = await import("/src/ui/Duel/Message/CardModal/index.tsx");
        showCardModal({ code: 89631139, meta: { id: 89631139, data: { type: 17, atk: 3000, def: 2500, race: 8192, attribute: 16 }, text: { name: "Blue-Eyes White Dragon", desc: "Synthetic local card details." } }, counters: {} });
      });
      await expect(page.getByTestId("duel-card-detail")).toBeVisible();
      const detailWrapper = page.getByTestId("duel-card-panel").locator("xpath=ancestor::div[contains(@class,'ant-drawer-content-wrapper')]");
      await expect(detailWrapper).toHaveCSS("transform", "none");
      const detail = await detailWrapper.boundingBox();
      assert.ok(detail.x >= rect.x - 1 && detail.x + detail.width <= width + 1, "Auxiliary details must fit inside the reserved rail");
      await expect(page.locator(".ant-drawer-mask")).toHaveCount(0);
      if (height <= 600) {
        assert.ok(detail.y < 20 && detail.height > height - 30, "Short landscape details need the full rail height");
        await page.screenshot({ path: `${folder}/${name}-details.png` });
        await page.getByTestId("duel-card-panel-close").click();
      }
      await page.getByTestId("duel-settings").click();
      await expect(page.getByTestId("settings-close")).toBeVisible();
      await page.getByTestId("settings-close").click();
      await expect(page.getByTestId("settings-close")).toHaveCount(0);
      if (height > 600) await expect(page.getByTestId("duel-card-detail")).toBeVisible();
      await page.screenshot({ path: `${folder}/${name}-sidebar.png` });
      if (height > 600) await page.getByTestId("duel-card-panel-close").click();
      await page.evaluate(async () => {
        const { chatStore } = window.__settingsTest;
        chatStore.sender = 8;
        chatStore.message = "Rotation keeps the chat log";
      });
      await rail.getByTestId("duel-chat-tab").click();
      await expect(page.getByTestId("duel-chat-panel")).toContainText("Rotation keeps the chat log");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("neos:open-duel-chat")));
      await expect(page.getByTestId("duel-chat-panel")).toContainText("Rotation keeps the chat log");
      await page.getByTestId("duel-chat-panel-close").click();
      assert.equal(await page.evaluate(() => window.__settingsTest.sent.length), 0, "Inspecting rail panels sent an online response");
    }
    assert.deepEqual(errors, [], `${name}: page errors`);
    await context.close();
  }
  console.log(`Client settings UI (${only ?? "settings/RPS/messages"}): ${profiles.map(([name]) => name).join(", ")} passed.`);
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
}
