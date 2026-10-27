// Synthetic native packets only; never logs in or connects to production WSS.
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const output = ".audit-tmp/revealed-hand";
mkdirSync(output, { recursive: true });
const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const reports = [];
let vite, browser;
try {
  if (!process.argv.includes("--built")) {
    await build({ logLevel: "error", build: { outDir: `${output}/client` }, plugins: [{
      name: "revealed-hand-test-only",
      transform(code, id) {
        if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
        return code + `
          import * as hCompat from "@/container/compat";
          import * as hStores from "@/stores";
          import * as hApi from "@/api";
          import * as hGen from "@/service/utils/genCard";
          import * as hOptions from "@/service/utils/fetchCheckCardMeta";
          import * as hEvents from "@/infra/eventbus";
          import * as hMessages from "@/service/onSocketMessage";
          import * as hDetail from "@/ui/Duel/Message/CardModal";
          window.__handImports = { hCompat, hStores, hApi, hGen, hOptions, hEvents, hMessages, hDetail };
        `;
      },
    }] });
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
    await context.route("**/duel-config.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};' }));
    await context.addInitScript(() => localStorage.setItem("language", "ja"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
    await page.evaluate(async () => {
      const { hCompat, hStores, hApi, hGen, hOptions, hEvents, hMessages, hDetail } = window.__handImports;
      const { initUIContainer, getUIContainer } = hCompat;
      const { cardStore, matStore, roomStore, historyStore } = hStores;
      const { ygopro, fetchCard } = hApi;
      const { genCard } = hGen;
      const { fetchCheckCardMeta } = hOptions;
      const { eventbus, Task } = hEvents;
      const { default: handle } = hMessages;
      const { closeCardModal } = hDetail;
      const packets = [], abort = new AbortController();
      initUIContainer({ ws: { readyState: 1, send(bytes) { packets.push([...new Uint8Array(bytes)]); } }, signal: abort.signal });
      matStore.reset(); cardStore.reset(); historyStore.reset();
      matStore.selfType = 1;
      matStore.initInfo.me.life = matStore.initInfo.op.life = 8000;
      roomStore.players = [{ name: "Test A", isMe: true, state: 0 }, { name: "Test B", isMe: false, state: 0 }];
      const codes = [89631139, 46986414, 26202165, 54652250, 5318639];
      const makeCard = (sequence, zone = ygopro.CardZone.HAND, code = 0) => genCard({
        uuid: `hidden-${zone}-${sequence}`, code, meta: fetchCard(code),
        location: new ygopro.CardLocation({ controller: 1, zone, sequence, is_overlay: false, position: ygopro.CardPosition.FACEDOWN_DEFENSE }),
        counters: {}, status: 0, targeted: false, isToken: false, idleInteractivities: [],
        selectInfo: { selectable: false, selected: false },
      });
      cardStore.inner = Array.from({ length: 6 }, (_, i) => makeCard(i));
      cardStore.inner.push(makeCard(0, ygopro.CardZone.DECK));
      const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return [...bytes]; };
      const send = async (type, bytes = []) => {
        const frame = Uint8Array.from([0, 0, 1, type, ...bytes]);
        new DataView(frame.buffer).setUint16(0, frame.length - 2, true);
        await handle(getUIContainer(), { data: frame.buffer });
      };
      const candidates = (sequences, explicit = false) => sequences.map((sequence, response) => ({
        code: typeof explicit === "number" ? explicit : explicit ? codes[sequence] : 0,
        location: new ygopro.CardLocation({ controller: 1, zone: ygopro.CardZone.HAND, sequence, position: ygopro.CardPosition.FACEDOWN_DEFENSE }), response,
      }));
      const options = async (sequences, explicit = false) => (await fetchCheckCardMeta(getUIContainer().context, candidates(sequences, explicit))).selectables.map(card => card.meta.id);
      const reveal = async () => send(31, [0, 0, codes.length, ...codes.flatMap((code, sequence) => [...u32(code), 1, 2, sequence])]);
      const select = async (sequences, explicit = false) => send(15, [0, 1, 1, 1, sequences.length,
        ...sequences.flatMap(sequence => [...u32(explicit ? codes[sequence] : 0), 1, 2, sequence, 8])]);
      const hidden = () => cardStore.at(ygopro.CardZone.HAND, 1).every(card => card.code === 0 && card.meta.id === 0);
      const names = codes.map(code => fetchCard(code).text.name);
      window.__hand = { send, u32, codes, names, cardStore, packets, options, reveal, select, hidden, closeCardModal, eventbus, Task, makeCard };
      // The first confirmation uses the real handler before cards mount.
      await reveal();
      location.hash = "#/duel";
    });
    await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 30000 });
    assert.equal(await page.evaluate(() => window.__hand.hidden()), true, "Confirmation must restore board concealment");
    const order = [2, 0, 3, 1];
    await page.evaluate(order => window.__hand.select(order), order);
    const modal = page.locator('[data-testid="duel-select-cards-modal"]:visible');
    await expect(modal).toBeVisible();
    const options = modal.getByTestId("duel-select-card-option");
    await expect(options).toHaveCount(4);
    const expectedCodes = order.map(i => [89631139, 46986414, 26202165, 54652250][i]);
    const actualCodes = await options.evaluateAll(els => els.map(el => Number(el.dataset.cardCode)));
    await page.screenshot({ path: `${output}/${profile}-selection.png` });
    assert.deepEqual(actualCodes, expectedCodes, "Revealed hand identities lost before zero-code selection");
    if (touch) {
      await options.nth(2).getByTestId("duel-select-card-preview").click();
      await expect(page.getByTestId("duel-card-detail")).toHaveAttribute("data-card-code", "54652250");
      await expect(page.locator(".ant-drawer:visible .ant-drawer-title")).toContainText(await page.evaluate(() => window.__hand.names[3]));
      await page.getByTestId("duel-card-panel-close").click();
      assert.equal(await page.evaluate(() => window.__hand.packets.length), 0, "Preview must not send a response");
    }
    await options.nth(2).locator(".ant-pro-checkcard").click();
    await page.evaluate(() => window.__hand.closeCardModal());
    await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
    await expect(modal).toBeHidden();
    assert.deepEqual(await page.evaluate(() => window.__hand.packets), [[3, 0, 1, 1, 2]], "Response index must follow server order");
    const boundaries = await page.evaluate(async () => {
      const h = window.__hand;
      // Boundary checks replace focus only; real reveal animations have their own regression.
      const disposers = h.cardStore.inner.map(card => h.eventbus.register(h.Task.Focus, card.uuid, async () => {}));
      try {
        const unconfirmed = await h.options([5]);
        const explicit = await h.options([0, 1], 5318639);
        await h.send(33, [1, 6, ...Array.from({ length: 6 }, () => h.u32(0)).flat()]);
        const shuffled = await h.options([0, 1, 2, 3]);
        await h.reveal();
        await h.send(50, [...h.u32(0), 1, 2, 0, 8, 1, 1, 0, 8, ...h.u32(0)]);
        const moved = h.cardStore.at(0, 1, 0)?.confirmedHandCode;
        const remaining = await h.options([0, 1, 2]);
        await h.send(74);
        const ended = await h.options([0, 1, 2]);
        await h.reveal();
        await h.send(40, [1]);
        const nextTurn = await h.options([0, 1, 2]);
        const hidden = h.hidden();
        return { unconfirmed, explicit, shuffled, moved, remaining, ended, nextTurn, hidden };
      } finally { disposers.forEach(dispose => dispose()); }
    });
    assert.deepEqual(boundaries.unconfirmed, [0]);
    assert.deepEqual(boundaries.explicit, [5318639, 5318639], "Explicit server code must override a confirmed identity");
    assert.deepEqual(boundaries.shuffled, [0, 0, 0, 0], "Hand shuffle must invalidate remembered positions");
    assert.equal(boundaries.moved, undefined, "Moved cards must drop temporary hand identity");
    assert.deepEqual(boundaries.remaining, [46986414, 26202165, 54652250], "Identity must follow the same cards when sequences compact");
    assert.deepEqual(boundaries.ended, [0, 0, 0], "Chain end must restore blind selection");
    assert.deepEqual(boundaries.nextTurn, [0, 0, 0], "Turn change must clear non-chain confirmations");
    assert.equal(boundaries.hidden, true);
    assert.deepEqual(errors, []);
    reports.push({ profile, actualCodes, response: [1, 2], boundaries, errors });
    console.log(`PASS ${profile}: confirmed hand selection, preview, response order and concealment boundaries`);
    await context.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser?.close();
  if (vite) await new Promise(resolve => vite.httpServer.close(resolve));
}
