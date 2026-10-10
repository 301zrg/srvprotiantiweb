// Synthetic public game messages; no production accounts or live WSS.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const output = ".audit-tmp/duel-results";
mkdirSync(output, { recursive: true });
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const words = {
  cn: { title: "宣言卡片类型", types: ["怪兽卡", "魔法卡", "陷阱卡"], race: ["战士", "龙"], attribute: ["炎", "暗"], coins: ["正面", "反面"], first: "先攻方" },
  en: { title: "Declared card type", types: ["Monster Cards", "Spell Cards", "Trap Cards"], race: ["Warrior", "Dragon"], attribute: ["Fire", "Dark"], coins: ["Heads", "Tails"], first: "First player" },
  ja: { title: "宣言したカードの種類", types: ["モンスターカード", "魔法カード", "罠カード"], race: ["戦士族", "ドラゴン族"], attribute: ["炎", "闇"], coins: ["表", "裏"], first: "先攻側" },
  ko: { title: "선언한 카드 종류", types: ["몬스터 카드", "마법 카드", "함정 카드"], race: ["전사족", "드래곤족"], attribute: ["화염", "어둠"], coins: ["앞면", "뒷면"], first: "선공 측" },
};
let vite, browser;
const reports = [];
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir: `${output}/client` },
      plugins: [{
        name: "duel-results-test-only-hooks",
        transform(code, id) {
          if (!id.replace(/\\/g, "/").endsWith("/src/main.tsx")) return;
          return code + `
            import * as testCompat from "@/container/compat";
            import * as testStores from "@/stores";
            import * as testApi from "@/api";
            import * as testGen from "@/service/utils/genCard";
            import * as testMessages from "@/service/onSocketMessage";
            import * as testSettings from "@/stores/settingStore";
            import * as testHistory from "@/ui/Duel/Message/ActionHistory";
            import * as testSettingPanel from "@/ui/Setting";
            window.__duelTest = { compat:testCompat, stores:testStores, api:testApi,
              gen:testGen, messages:testMessages, settings:testSettings,
              history:testHistory, settingPanel:testSettingPanel };
          `;
        },
      }],
    });
    cpSync("neos-assets", `${output}/client/neos-assets`, { recursive: true });
  }
  vite = await preview({ build: { outDir: `${output}/client` }, preview: { host: "127.0.0.1", port: 0 } });
  const origin = vite.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: existsSync(edge) ? edge : undefined });
  for (const [profile, width, height, touch] of [
    ["desktop", 1280, 800, false], ["portrait", 390, 844, true], ["landscape", 844, 390, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await context.route(/https?:\/\/(?!127\.0\.0\.1).*\.(jpg|png)(\?.*)?$/, route => route.fulfill({
      contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6AAAASUVORK5CYII=", "base64"),
    }));
    await context.route("**/duel-config.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};' }));
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 90000 });
    await page.evaluate(async () => {
      const { initUIContainer, getUIContainer } = window.__duelTest.compat;
      const stores = window.__duelTest.stores;
      const { ygopro, fetchCard } = window.__duelTest.api;
      const { genCard } = window.__duelTest.gen;
      const { default: handle } = window.__duelTest.messages;
      const { settingStore } = window.__duelTest.settings;
      const packets = [], abort = new AbortController();
      initUIContainer({ ws: { readyState: 1, send(bytes) { packets.push([...new Uint8Array(bytes)]); } }, signal: abort.signal });
      const { matStore, roomStore, cardStore, historyStore } = stores;
      matStore.reset(); cardStore.reset(); historyStore.reset();
      matStore.selfType = 1;
      matStore.initInfo.me.life = matStore.initInfo.op.life = 8000;
      roomStore.players = [{ name: "Test A", isMe: true, state: 0 }, { name: "Test B", isMe: false, state: 0 }];
      roomStore.joined = false;
      const card = (uuid, code, controller, zone) => genCard({
        uuid, code, meta: code ? fetchCard(code) : { id: 0, text: {}, data: {} },
        location: new ygopro.CardLocation({ controller, zone, sequence: 0, is_overlay: false, position: ygopro.CardPosition.FACEUP_ATTACK }),
        counters: {}, status: 0, targeted: false, isToken: false, idleInteractivities: [],
        selectInfo: { selectable: false, selected: false },
      });
      cardStore.inner.push(
        card("ruler", 54719828, 0, ygopro.CardZone.MZONE),
        card("prohibition", 43711255, 0, ygopro.CardZone.SZONE),
        card("hidden-hand", 0, 1, ygopro.CardZone.HAND),
      );
      function u32(value) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, value, true); return [...b]; }
      const send = async (type, bytes) => {
        const frame = Uint8Array.from([0, 0, 1, type, ...bytes]);
        new DataView(frame.buffer).setUint16(0, frame.length - 2, true);
        await handle(getUIContainer(), { data: frame.buffer });
      };
      window.__results = { ...stores, send, u32, settingStore, packets, abort };
      location.hash = "#/duel";
    });
    await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 30000 });
    // Let the initial opponent-hand placement complete before revealing it.
    await page.waitForTimeout(450);
    const hand = page.locator('[data-testid="duel-card"][data-card-uuid="hidden-hand"]');
    await expect.poll(() => hand.evaluate(el => Number.parseFloat(getComputedStyle(el).getPropertyValue("--ry")))).toBe(180);
    const state = await page.evaluate(async () => {
      const { send, u32, historyStore, cardStore } = window.__results;
      await send(2, [3, 0, ...u32(70)]);
      await send(2, [1, 0, ...u32(70)]);
      const promptCount = historyStore.historys.length;
      for (const value of [70, 71, 72]) await send(2, [4, 0, ...u32(value)]);
      await send(2, [4, 1, ...u32(54719828 * 16 + 2)]);
      for (const [kind, player, value] of [
        [6, 0, 1 | 0x2000], [7, 1, 4 | 0x20], [9, 0, 0],
        [11, 1, 1 | 0x1000000], [5, 0, 54719828], [10, 1, 98645731], [2, 0, 65],
      ]) await send(2, [kind, player, ...u32(value)]);
      await send(2, [8, 0, ...u32(89631139)]);
      await send(160, [0, 8, 0, 1, 2, ...u32(89631139)]);
      await send(160, [0, 8, 0, 1, 2, ...u32(89631139)]);
      const declarationCount = historyStore.historys.filter(h => h.result?.kind === "card").length;
      for (const [kind, value] of [[3, 1], [4, 0x20], [5, 3], [1, 2], [6, 43711255 * 16], [7, 43711255 * 16]])
        await send(160, [0, 8, 0, 1, kind, ...u32(value)]);
      for (const kind of [6, 7])
        for (const player of [0, 1]) await send(165, [player, kind, ...u32(54719828 * 16 + 2)]);
      await send(130, [0, 3, 1, 0, 1]);
      await send(131, [1, 2, 2, 6]);
      // Unknown descriptions remain traceable rather than showing bare '?'.
      await send(2, [4, 1, ...u32(9999)]);
      const { displayActionHistory } = window.__duelTest.history;
      displayActionHistory();
      return {
        promptCount, declarationCount, count: historyStore.historys.length,
        unimplemented: window.__results.matStore.unimplemented,
        lastCardHint: cardStore.inner.find(c => c.uuid === "prohibition").hint,
      };
    });
    assert.equal(state.promptCount, 0, "Prompts are not confirmed decisions");
    assert.equal(state.declarationCount, 1, "Repeated identical card hints must not duplicate history");
    assert.equal(state.unimplemented, 0, "Player restriction hints must be handled");
    assert.deepEqual(state.lastCardHint, { type: 1, value: 2 }, "Description add/remove must preserve the independent persistent card hint");
    const panel = page.getByTestId("duel-history-panel");
    await expect(panel).toBeVisible();
    const option = panel.locator('[data-result-kind="option"]');
    const historyJson = await page.evaluate(() => JSON.stringify(window.__results.historyStore.historys));
    await page.evaluate(async () => {
      const { openSettingPanel } = window.__duelTest.settingPanel;
      window.__results.openSettingPanel = openSettingPanel;
    });
    for (const [language, label] of [["cn", "简体中文"], ["en", "English"], ["ja", "日本語"], ["ko", "한국어"]]) {
      if (language !== "cn") {
        await page.evaluate(() => window.__results.openSettingPanel({ defaultKey: "language" }));
        await page.locator(".ant-modal:visible .ant-select").click();
        await page.locator(".ant-select-dropdown:visible .ant-select-item-option").filter({ hasText: label }).click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem("language"))).toBe(language);
        await page.getByTestId("settings-close").click();
      }
      const expected = words[language];
      for (let i = 0; i < 3; i++) {
        await expect(option.nth(i)).toContainText(expected.title);
        await expect(option.nth(i).getByTestId("duel-history-result-value")).toHaveText(expected.types[i]);
      }
      const race = panel.locator('[data-result-kind="race"]').first();
      const attribute = panel.locator('[data-result-kind="attribute"]').first();
      for (const text of expected.race) await expect(race).toContainText(text);
      for (const text of expected.attribute) await expect(attribute).toContainText(text);
      for (const text of expected.coins) await expect(panel.locator('[data-result-kind="coin"]')).toContainText(text);
      await expect(panel.locator('[data-result-kind="dice"]')).toContainText("2 / 6");
      await expect(panel.locator('[data-result-kind="number"]').first().getByTestId("duel-history-result-value")).toHaveText("0");
      await expect(option.last().getByTestId("duel-history-result-value")).toHaveText("#9999");
      assert.equal(await panel.locator('[data-result-kind="playerDescriptionAdded"]').count(), 2);
      assert.equal(await panel.locator('[data-result-kind="playerDescriptionRemoved"]').count(), 2);
      await expect(option.nth(3)).not.toContainText("[?]");
      assert.equal(await page.evaluate(() => JSON.stringify(window.__results.historyStore.historys)), historyJson, "Changing language must preserve raw historical results");
      assert.equal(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, "History must not overflow the phone panel");
      reports.push({ profile, language, confirmedResults: state.count, noPromptHistory: true, noResponses: true });
    }
    await page.evaluate(() => {
      window.__results.matStore.selfType = window.__duelTest.api.ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
      window.__results.matStore.observerView = 1;
    });
    await expect(option.first()).toContainText(words.ko.first);
    await page.screenshot({ path: `${output}/${profile}-history.png` });
    await page.getByTestId("duel-history-panel-close").click();
    await page.evaluate(() => window.__results.matStore.selfType = 1);
    await page.evaluate(() => {
      const { send, u32, settingStore } = window.__results;
      settingStore.animation.speed = 0.7;
      window.__results.revealSamples = [];
      const start = performance.now();
      let done = false;
      const record = () => {
        const el = document.querySelector('[data-card-uuid="hidden-hand"]');
        const rotation = Number.parseFloat(getComputedStyle(el).getPropertyValue("--ry"));
        const card = window.__results.cardStore.inner.find(c => c.uuid === "hidden-hand");
        if (Math.abs(rotation) < 0.5 && card.code === 89631139)
          window.__results.revealSamples.push(performance.now());
        if (!done) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
      window.__results.reveal = send(31, [0, 0, 1, ...u32(89631139), 1, 2, 0]).then(() => {
        done = true; window.__results.revealElapsed = performance.now() - start;
      });
    });
    const reveal = await page.evaluate(async () => {
      await window.__results.reveal;
      const { revealSamples, cardStore, historyStore, packets, revealElapsed } = window.__results;
      const card = cardStore.inner.find(c => c.uuid === "hidden-hand");
      return {
        heldMs: revealSamples.at(-1) - revealSamples[0], elapsedMs: revealElapsed,
        finalCode: card.code, finalMeta: card.meta.id, packets: packets.length,
        confirmed: historyStore.historys.some(h => h.operation === 4 && h.card === 89631139),
      };
    });
    assert.ok(reveal.heldMs >= 600 && reveal.heldMs < 1500, JSON.stringify(reveal));
    assert.equal(reveal.finalCode, 0, "Revealed opponent hand must return to its concealed identity");
    assert.equal(reveal.finalMeta, 0);
    assert.equal(reveal.confirmed, true, "Confirmed card remains available in history after hiding");
    assert.equal(reveal.packets, 0, "Viewing received results must never send duel responses");
    const choose = async (type, bytes, response) => {
      await page.evaluate(({ type, bytes }) => {
        window.__results.choice = window.__results.send(type, bytes);
      }, { type, bytes });
      await expect(page.getByTestId("duel-option-modal")).toBeVisible();
      await page.locator(`[data-testid="duel-option-item"][data-option-response="${response}"]`).click();
      await expect(page.getByTestId("duel-option-submit")).toBeEnabled();
      await page.getByTestId("duel-option-submit").click();
      await page.evaluate(() => window.__results.choice);
    };
    const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return [...b]; };
    await choose(14, [0, 3, ...[70, 71, 72].flatMap(u32)], 2);
    const localOption = await page.evaluate(() => window.__results.historyStore.historys.at(-1));
    assert.deepEqual(localOption.result, { kind: "option", value: 72 });
    assert.equal(localOption.source, "response");
    const beforeEcho = await page.evaluate(() => window.__results.historyStore.historys.length);
    await page.evaluate(async () => {
      const { send, u32 } = window.__results;
      await send(2, [4, 0, ...u32(72)]);
    });
    assert.equal(await page.evaluate(() => window.__results.historyStore.historys.length), beforeEcho, "An echoed own result is merged with its submitted record");
    await choose(140, [0, 1, ...u32(1 | 0x2000)], 0x2000);
    await choose(141, [0, 1, ...u32(4 | 32)], 32);
    await choose(143, [0, 2, ...u32(0), ...u32(5)], 1);
    await page.evaluate(() => {
      const { send, u32 } = window.__results;
      window.__results.choice = send(142, [0, 2, ...u32(89631139), ...u32(0x40000100)]);
    });
    await expect(page.getByTestId("duel-announce-modal")).toBeVisible();
    const cardName = await page.evaluate(() => window.__duelTest.api.fetchCard(89631139).text.name);
    assert.ok(cardName, "Declaration uses the current language's card database");
    await page.getByTestId("duel-announce-search").fill(cardName);
    await page.getByTestId("duel-announce-search-submit").click();
    await page.locator('[data-testid="duel-announce-card-option"][data-card-code="89631139"] input').check();
    await page.getByTestId("duel-announce-submit").click();
    await page.evaluate(() => window.__results.choice);
    const submitted = await page.evaluate(() => ({
      rows: window.__results.historyStore.historys.slice(-4),
      packets: window.__results.packets.map(bytes => new DataView(Uint8Array.from(bytes).buffer).getInt32(3, true)),
    }));
    assert.deepEqual(submitted.rows.slice(0, 3).map(row => row.result), [
      { kind: "race", value: 0x2000 }, { kind: "attribute", value: 32 }, { kind: "number", value: 5 },
    ], "Own announcements use actual values, not option indexes");
    assert.equal(submitted.rows.at(-1).card, 89631139);
    assert.equal(submitted.rows.at(-1).source, "response");
    assert.deepEqual(submitted.packets, [2, 0x2000, 32, 1, 89631139]);
    for (const accepted of [false, true]) {
      const before = await page.evaluate(() => window.__results.historyStore.historys.length);
      await page.evaluate(({ bytes }) => {
        window.__results.choice = window.__results.send(13, bytes);
      }, { bytes: [0, ...u32(54719828 * 16 + 1)] });
      await expect(page.getByTestId("duel-yesno-yes")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__results.historyStore.historys.length), before, "An unanswered prompt is not a decision");
      await page.getByTestId(accepted ? "duel-yesno-yes" : "duel-yesno-no").click();
      await page.evaluate(() => window.__results.choice);
      const recorded = await page.evaluate(() => window.__results.historyStore.historys.at(-1));
      assert.deepEqual(recorded.result, { kind: "yesNo", value: 54719828 * 16 + 1, accepted });
      assert.equal(recorded.card, 54719828);
      assert.equal(await page.evaluate(() => window.__results.historyStore.historys.length), before + 1);
    }
    await page.evaluate(({ bytes }) => {
      window.__results.choice = window.__results.send(12, bytes);
    }, { bytes: [0, ...u32(54719828), 0, 4, 0, 1, ...u32(0)] });
    await expect(page.getByTestId("duel-yesno-yes")).toBeVisible();
    await page.getByTestId("duel-yesno-no").click();
    await page.evaluate(() => window.__results.choice);
    assert.deepEqual(await page.evaluate(() => window.__results.historyStore.historys.at(-1).result),
      { kind: "effectDecision", value: 0, accepted: false });
    assert.deepEqual(await page.evaluate(() => window.__results.packets.slice(-3).map(bytes =>
      new DataView(Uint8Array.from(bytes).buffer).getInt32(3, true))), [0, 1, 0]);
    await page.evaluate(() => window.__duelTest.history.displayActionHistory());
    await expect(panel.locator('[data-result-kind="yesNo"]').first()).toContainText("아니요");
    await expect(panel.locator('[data-result-kind="yesNo"]').last()).toContainText("예");
    await expect(panel.locator('[data-result-kind="effectDecision"]').last()).toContainText("아니요");
    assert.deepEqual(errors, []);
    reports.push({ profile, reveal, ownSubmittedDecisions: 8, echoDeduplicated: true });
    await context.close();
    console.log(`PASS ${profile}: four-language result history and readable hand reveal`);
  }
  writeFileSync(`${output}/results.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ reports, realPhoneTested: false, productionConnections: 0 }));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  if (vite) await new Promise(resolve => vite.httpServer.close(resolve));
}
