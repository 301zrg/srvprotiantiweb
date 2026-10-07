// Public, synthetic native YGOPro packets only; no production connection.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const folder = ".audit-tmp/duel-feedback";
mkdirSync(folder, { recursive: true });
const baseline = process.argv.includes("--baseline");
const results = [];
let browser, vite;
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
try {
  vite = await createServer({ server: { host: "127.0.0.1", port: 0 } });
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: existsSync(edge) ? edge : undefined });
  for (const [name, width, height, touch] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    const origin = vite.resolvedUrls.local[0];
    // Synthetic protocol checks must not wait on public fonts or other CDNs.
    await context.route("**/*", route =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    await context.route("**/duel-config.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};' }));
    await context.route(/https?:\/\/(?!127\.0\.0\.1).*\.(jpg|png)(\?.*)?$/, route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6AAAASUVORK5CYII=", "base64") }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(vite.resolvedUrls.local[0], { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
    const state = await page.evaluate(async () => {
      const { initUIContainer, getUIContainer } = await import("/src/container/compat.ts");
      const { cardStore, matStore, roomStore, historyStore } = await import("/src/stores/index.ts");
      const { ygopro } = await import("/src/api/index.ts");
      const { default: handle } = await import("/src/service/onSocketMessage.ts");
      initUIContainer({ ws: { readyState: 1, send() {} } });
      matStore.selfType = 1;
      matStore.initInfo.me.life = 8000;
      matStore.initInfo.op.life = 8000;
      roomStore.players = [{ name: "反馈测试", isMe: true, state: 0 }, { name: "对手", isMe: false, state: 0 }];
      function u32(value) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, value, true); return [...b]; }
      const send = async (type, bytes) => {
        const frame = Uint8Array.from([0, 0, 1, type, ...bytes]);
        new DataView(frame.buffer).setUint16(0, frame.length - 2, true);
        await handle(getUIContainer(), { data: frame.buffer });
      };
      const reload = [2];
      for (let player = 0; player < 2; player++) {
        reload.push(...u32(8000));
        for (let seq = 0; seq < 7; seq++) reload.push(...(player === 1 && seq === 0 ? [1, 1, 2] : [0]));
        for (let seq = 0; seq < 8; seq++) reload.push(...(player === 0 && seq === 0 ? [1, 1] : [0]));
        reload.push(0, 0, 0, 0, 0, 0);
      }
      reload.push(0); // No chains.
      await send(162, reload);
      // Code, type, attack, defense, overlay IDs, counters, status.
      const query = (controller, zone, code, atk, overlays, includeOverlays = true) => {
        const flags = 1 | 8 | 0x100 | 0x200 | (includeOverlays ? 0x10000 : 0) | 0x20000 | 0x80000;
        const fields = [...u32(flags), ...u32(code), ...u32(zone === 4 ? 0x800021 : 0x20002), ...u32(atk), ...u32(0)];
        if (includeOverlays) fields.push(...u32(overlays.length), ...overlays.flatMap(u32));
        fields.push(...u32(1), 1, 0, 2, 0, ...u32(0));
        return [controller, zone, 0, ...u32(fields.length + 4), ...fields];
      };
      await send(7, query(1, 4, 84013237, 2200, [89631139, 46986414]));
      await send(7, query(0, 8, 43711255, 0, []));
      await new Promise(resolve => setTimeout(resolve, 20));
      const monster = cardStore.at(ygopro.CardZone.MZONE, 1, 0);
      const before = { atk: monster.meta.data.atk, overlays: cardStore.findOverlay(ygopro.CardZone.MZONE, 1, 0).map(c => c.code), counters: monster.counters };
      await send(7, query(1, 4, 84013237, 2300, [], false));
      const partial = cardStore.findOverlay(ygopro.CardZone.MZONE, 1, 0).map(c => c.code);
      // Native Prohibition CHINT_CARD notification, followed by public announce log.
      await send(160, [0, 8, 0, 1, 2, ...u32(89631139)]);
      const spell = cardStore.at(ygopro.CardZone.SZONE, 0, 0);
      const hintHandled = matStore.unimplemented === 0 && spell.hint?.value === 89631139;
      await send(2, [8, 0, ...u32(89631139)]);
      const announcementLogged = historyStore.historys.some(h => h.operation === 10 && h.card === 89631139);
      // Avoid leaving the unsupported warning open on a baseline screenshot.
      matStore.unimplemented = 0;
      const { showCardModal } = await import("/src/ui/Duel/Message/CardModal/index.tsx");
      const { displayActionHistory } = await import("/src/ui/Duel/Message/ActionHistory/index.tsx");
      window.__feedback = { send, query, monster, spell, showCardModal, displayActionHistory, cardStore, matStore, roomStore, u32 };
      location.hash = "#/duel";
      return { before, partial, hintHandled, announcementLogged };
    });
    await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 30000 });
    await page.evaluate(() => window.__feedback.showCardModal(window.__feedback.monster));
    await expect(page.getByTestId("duel-card-detail")).toBeVisible();
    await page.evaluate(async () => {
      const { connectionStore } = await import("/src/variant/connection.ts");
      connectionStore.state = "disconnected";
      connectionStore.detail = "对战连接已断开，请返回联机页重新入场。";
    });
    const banner = page.getByRole("alert").filter({ hasText: "对战连接已断开" });
    await expect(banner).toBeVisible();
    await page.waitForTimeout(350);
    const unobscured = await banner.evaluate(el => {
      const r = el.getBoundingClientRect();
      return [r.left + 8, r.left + r.width / 2, r.right - 8].every(x => el.contains(document.elementFromPoint(x, r.top + r.height / 2)));
    });
    const lifeRects = await page.getByTestId("duel-player-life").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    const detailRect = await page.getByTestId("duel-card-panel").locator("xpath=ancestor::div[contains(@class,'ant-drawer-content-wrapper')]").evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    const coversLife = lifeRects.some(r => r.left < detailRect.right && r.right > detailRect.left && r.top < detailRect.bottom && r.bottom > detailRect.top);
    await page.screenshot({ path: `${folder}/${baseline ? "before" : "after"}-${name}-disconnect.png` });
    if (!baseline) {
      assert.equal(state.before.atk, 2200, "Static card metadata overwrote server ATK after code refresh");
      assert.deepEqual(state.before.overlays, [89631139, 46986414], "Reloaded overlay identity missing");
      assert.deepEqual(state.before.counters, { 1: 2 });
      assert.deepEqual(state.partial, [89631139, 46986414], "Partial query cleared overlay materials");
      assert.equal(state.hintHandled, true, "Prohibition hint unsupported");
      assert.equal(state.announcementLogged, true, "Public announcement missing from history");
      assert.equal(unobscured, true, "Disconnected banner hidden by open drawer");
      if (!touch) assert.equal(coversLife, false, "Docked card details cover life points");
      await expect(page.locator('[data-testid="duel-card-stat"][data-stat="ATK"]')).toHaveAttribute("data-stat-value", "2300");
      await page.evaluate(async () => {
        const { send, u32 } = window.__feedback;
        await send(7, [1, 4, 0, ...u32(12), ...u32(0x100), ...u32(2400)]);
      });
      await expect(page.locator('[data-testid="duel-card-stat"][data-stat="ATK"]')).toHaveAttribute("data-stat-value", "2400");
    }
    await page.getByTestId("duel-card-panel-close").click();
    await page.evaluate(() => window.__feedback.showCardModal(window.__feedback.spell));
    await expect(page.getByTestId("duel-card-detail")).toBeVisible();
    if (!baseline) {
      await expect(page.getByTestId("duel-card-hint")).toContainText("青眼白龙");
      await expect(page.getByTestId("duel-card-stats")).toHaveCount(0);
    }
    await page.waitForTimeout(350); // Settle the drawer transition for the review image.
    await page.screenshot({ path: `${folder}/${baseline ? "before" : "after"}-${name}-prohibition.png` });
    await page.getByTestId("duel-card-panel-close").click();
    await page.evaluate(() => window.__feedback.displayActionHistory());
    await expect(page.getByTestId("duel-history-panel")).toBeVisible();
    if (!baseline) await expect(page.getByTestId("duel-history-panel")).toContainText("青眼白龙");
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${folder}/${baseline ? "before" : "after"}-${name}-history.png` });
    if (!baseline) {
      // Authoritative zero count removes materials; absent fields preserve stats.
      await page.getByTestId("duel-history-panel-close").click();
      await page.evaluate(async () => {
        const { displayCardListModal } = await import("/src/ui/Duel/Message/CardListModal/index.tsx");
        displayCardListModal({ isZone: false, monster: window.__feedback.monster });
      });
      await expect(page.getByTestId("duel-card-list")).toHaveAttribute("data-card-count", "2");
      await page.evaluate(async () => {
        const { send, query } = window.__feedback;
        await send(7, query(1, 4, 84013237, 0, []));
        await send(160, [0, 8, 0, 1, 0, 0, 0, 0, 0]);
      });
      const final = await page.evaluate(() => ({ count: window.__feedback.cardStore.findOverlay(window.__feedback.monster.location.zone, 1, 0).length, atk: window.__feedback.monster.meta.data.atk, hint: window.__feedback.spell.hint }));
      assert.equal(final.count, 0);
      assert.equal(final.atk, 0);
      assert.equal(final.hint, undefined);
      await expect(page.getByTestId("duel-card-list")).toHaveAttribute("data-card-count", "0");
      await page.evaluate(async () => { const { closeCardListModal } = await import("/src/ui/Duel/Message/CardListModal/index.tsx"); closeCardListModal(); });
      // Both native observer start variants must preserve room/core ordering.
      for (const swapped of [false, true]) {
        await page.evaluate(async (swapped) => {
          const { send, u32, cardStore, matStore, roomStore } = window.__feedback;
          const { ygopro } = await import("/src/api/index.ts");
          const { connectionStore } = await import("/src/variant/connection.ts");
          connectionStore.state = "connected";
          matStore.reset();
          cardStore.reset();
          roomStore.selfType = ygopro.StocTypeChange.SelfType.OBSERVER;
          roomStore.players = [{ name: "座位甲", isMe: false }, { name: "座位乙", isMe: false }];
          await send(4, [swapped ? 0x11 : 0x10, 2, ...u32(6000), ...u32(7200), 0, 0, 0, 0, 0, 0, 0, 0]);
          // Add visible public cards to verify physical position rotates too.
          const { genCard } = await import("/src/service/utils/genCard.ts");
          const { fetchCard } = await import("/src/api/index.ts");
          cardStore.inner.push(...[0, 1].map(controller => genCard({ uuid: `observer-${controller}`, code: 89631139, meta: fetchCard(89631139), location: new ygopro.CardLocation({ controller, zone: ygopro.CardZone.MZONE, sequence: 0, position: ygopro.CardPosition.FACEUP_ATTACK }), counters: {}, idleInteractivities: [], isToken: false, targeted: false, status: 0, selectInfo: { selectable: false, selected: false } })));
          matStore.currentPlayer = 0;
        }, swapped);
        const near = page.locator('[data-testid="duel-player-life"][data-player="me"]');
        const far = page.locator('[data-testid="duel-player-life"][data-player="op"]');
        await expect(near).toHaveAttribute("data-controller", "0");
        await expect(near).toHaveAttribute("data-life", "6000");
        await expect(near.getByTestId("duel-player-name")).toHaveText(swapped ? "座位乙" : "座位甲");
        await expect(far.getByTestId("duel-player-name")).toHaveText(swapped ? "座位甲" : "座位乙");
        await expect(page.getByTestId("duel-phase-select")).toBeDisabled();
        await expect(page.getByTestId("duel-surrender")).toHaveCount(0);
        const publicZero = page.locator('[data-testid="duel-card"][data-card-uuid="observer-0"]');
        const publicOne = page.locator('[data-testid="duel-card"][data-card-uuid="observer-1"]');
        await expect.poll(async () => (await publicZero.boundingBox()).y - (await publicOne.boundingBox()).y).toBeGreaterThan(0);
        const identity = await page.evaluate(() => ({ selfType: window.__feedback.matStore.selfType, cards: window.__feedback.cardStore.inner.map(c => [c.uuid, c.location.controller, c.code]) }));
        await page.getByTestId("duel-switch-view").click();
        await expect(page.getByTestId("duel-board-viewport")).toHaveAttribute("data-view-controller", "1");
        await expect(near).toHaveAttribute("data-life", "7200");
        await expect(near.getByTestId("duel-player-name")).toHaveText(swapped ? "座位甲" : "座位乙");
        await expect(far.getByTestId("duel-player-name")).toHaveText(swapped ? "座位乙" : "座位甲");
        await expect.poll(async () => (await publicZero.boundingBox()).y - (await publicOne.boundingBox()).y).toBeLessThan(0);
        const after = await page.evaluate(() => ({ selfType: window.__feedback.matStore.selfType, cards: window.__feedback.cardStore.inner.map(c => [c.uuid, c.location.controller, c.code]) }));
        assert.deepEqual(after, identity, "View switch changed observer identity or protocol controllers");
        // Incoming LP updates continue to target the same core player after flip.
        await page.evaluate(async () => { const { send, u32 } = window.__feedback; await send(94, [0, ...u32(5000)]); });
        await expect(far).toHaveAttribute("data-life", "5000");
        await expect(near).toHaveAttribute("data-life", "7200");
        await expect(far.getByTestId("duel-player-life-value")).toHaveText("5000");
        await expect(near.getByTestId("duel-player-life-value")).toHaveText("7200");
        await page.screenshot({ path: `${folder}/after-${name}-observer-${swapped ? "swapped" : "normal"}.png` });
        await page.getByTestId("duel-switch-view").click();
        await expect(near).toHaveAttribute("data-life", "5000");
      }
      // Changing display language must preserve server-owned card data and view.
      await page.evaluate(async () => {
        const { cardStore } = window.__feedback;
        cardStore.inner.find(card => card.uuid === "observer-0").meta.data.atk = 1234;
        const { openSettingPanel } = await import("/src/ui/Setting/index.tsx");
        openSettingPanel({ defaultKey: "language" });
      });
      for (const [label, code] of [["English", "en"], ["简体中文", "cn"]]) {
        await page.locator(".ant-modal:visible .ant-select").click();
        await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: label }).click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("language"))).toBe(code);
        assert.equal(await page.evaluate(() => window.__feedback.cardStore.inner.find(card => card.uuid === "observer-0").meta.data.atk), 1234);
        await expect(page.getByTestId("duel-board-viewport")).toHaveAttribute("data-view-controller", "0");
      }
      await page.getByTestId("settings-close").click();
      assert.deepEqual(errors, []);
    }
    results.push({ name, ...state, unobscured, coversLife, observerStartOrders: baseline ? [] : ["0x10", "0x11"], viewSwitchPreservesIdentity: !baseline, languageKeepsLiveStats: !baseline, errors });
    await context.close();
  }
  writeFileSync(`${folder}/${baseline ? "before" : "after"}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser?.close();
  await vite?.close();
}
