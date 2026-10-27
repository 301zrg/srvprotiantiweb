// Synthetic public card fixtures through the real native packet adapter and UI.
// No connection to a game server is made. --capture-before records known defects.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const before = process.argv.includes('--capture-before');
const folder = '.audit-tmp/zero-selection-reveal/' + (before ? 'before' : 'after');
mkdirSync(folder, { recursive: true });
const u32 = (value) => [...new Uint8Array(new Uint32Array([value]).buffer)];
const topCodes = [89631139, 46986414, 70781052];
let server, browser;
const results = [];
try {
  server = await createServer({ mode: 'production', server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/*'] } } });
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  for (const [name, width, height] of [['desktop', 1280, 800], ['portrait', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: name === 'portrait', isMobile: name === 'portrait' });
    const imageRequests = [];
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(origin)) return route.continue();
      if (/\.(jpg|webp|png)(\?|$)/i.test(url)) {
        imageRequests.push(url);
        return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="59" height="86"><rect width="59" height="86" fill="#007f70"/></svg>' });
      }
      return route.abort();
    });
    await context.addInitScript(() => localStorage.setItem('language', 'cn'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
    await page.evaluate(async () => {
      const { initUIContainer, getUIContainer } = await import('/src/container/compat.ts');
      const stores = await import('/src/stores/index.ts');
      const { fetchCard, ygopro, getCardImgUrl } = await import('/src/api/index.ts');
      const { default: handle } = await import('/src/service/onSocketMessage.ts');
      const { eventbus, Task } = await import('/src/infra/index.ts');
      const state = window.__rule = { packets: [], samples: [], stores, getCardImgUrl };
      initUIContainer({ signal: new AbortController().signal, ws: { readyState: 1, send(value) { state.packets.push([...value]); } }, cancelled: false, isClosed: false });
      state.send = async (type, bytes) => {
        const frame = Uint8Array.from([0, 0, 1, type, ...bytes]);
        new DataView(frame.buffer).setUint16(0, frame.length - 2, true);
        await handle(getUIContainer(), { data: frame.buffer });
      };
      state.card = (zone, sequence, code, controller = 0) => ({ uuid: `rules-${zone}-${controller}-${sequence}`, code, meta: fetchCard(code), location: new ygopro.CardLocation({ controller, zone, sequence, position: ygopro.CardPosition.FACEDOWN_DEFENSE, is_overlay: false }), idleInteractivities: [], counters: {}, isToken: false, targeted: false, selectInfo: { selectable: false, selected: false }, status: 0 });
      state.setup = (count) => {
        stores.cardStore.inner = Array.from({ length: count }, (_, i) => state.card(ygopro.CardZone.SZONE, i, 83968380, 1));
        stores.cardStore.deckReversed = false;
        state.packets.length = 0;
      };
      stores.matStore.selfType = 1;
      stores.matStore.initInfo.me.life = 8000;
      stores.matStore.initInfo.op.life = 8000;
      stores.roomStore.players = [{ name: 'A public fixture', isMe: true, state: 0 }, { name: 'B public fixture', isMe: false, state: 0 }];
      const originalCall = eventbus.call;
      eventbus.call = async (task, id, ...args) => {
        const card = stores.cardStore.inner.find((card) => card.uuid === id);
        if (task === Task.Focus && state.failFocus) throw Error('Synthetic focus failure');
        const promise = originalCall(task, id, ...args);
        if (task === Task.Focus && card?.location.zone === ygopro.CardZone.DECK) {
          await new Promise((resolve) => setTimeout(resolve, 180));
          const node = document.querySelector(`[data-testid="duel-card"][data-card-uuid="${id}"]`);
          state.samples.push({ nativeCode: card.code, shownCode: Number(node?.getAttribute('data-card-code')), backgrounds: [...node.querySelectorAll('[style]')].map((el) => el.style.getPropertyValue('--src')).filter(Boolean) });
        }
        return promise;
      };
      location.hash = '#/duel';
    });
    await expect(page.getByTestId('duel-menu')).toBeVisible();
    const report = { viewport: name, zero: [], reveal: [] };
    for (const count of [1, 2]) {
      await page.evaluate((count) => window.__rule.setup(count), count);
      const bytes = [0, 0, 0, 1, count, ...Array.from({ length: count }, (_, i) => [...u32(83968380), 1, 8, i, 8]).flat()];
      await page.evaluate((bytes) => { window.__rule.selection = window.__rule.send(15, bytes); }, bytes);
      const modal = page.locator('[data-testid="duel-select-cards-modal"]:visible');
      if (before && count === 1) {
        await expect.poll(() => page.evaluate(() => window.__rule.packets.length)).toBe(1);
        await expect(modal).toHaveCount(0);
        const packets = await page.evaluate(() => window.__rule.packets);
        assert.deepEqual(packets, [[3, 0, 1, 1, 0]], 'Baseline incorrectly forces one optional card');
        report.zero.push({ candidates: count, forcedResponse: packets[0], defect: true });
      } else {
        await expect(modal).toBeVisible();
        await expect(page.locator('[data-testid="duel-select-card-submit"]:visible')).toBeEnabled();
        await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
        await page.evaluate(() => window.__rule.selection);
        const packets = await page.evaluate(() => window.__rule.packets);
        assert.deepEqual(packets, [[2, 0, 1, 0]], 'Zero selection is a count byte; it is not cancellation');
        report.zero.push({ candidates: count, response: packets[0] });
      }
    }
    await page.evaluate(() => {
      const { stores, card } = window.__rule;
      stores.cardStore.inner = Array.from({ length: 3 }, (_, i) => card(0, i, 0));
      window.__rule.samples.length = 0;
    });
    await expect(page.locator('[data-testid="duel-card"][data-card-zone="DECK"]')).toHaveCount(3);
    await page.waitForTimeout(450);
    // Real fixed 706 Core MSG_CONFIRM_DECKTOP payload, obtained by the companion
    // test_practice_zero_selection.mjs original Pot of Duality activation.
    const reveal = [0, 3, ...topCodes.flatMap((code, i) => [...u32(code), 0, 1, 33 - i])];
    const requestsBefore = imageRequests.length;
    await page.evaluate((bytes) => window.__rule.send(30, bytes), reveal);
    const samples = await page.evaluate(() => window.__rule.samples);
    assert.equal(samples.length, 3);
    assert.deepEqual(samples.map((sample) => sample.nativeCode), topCodes);
    assert.deepEqual(samples.map((sample) => sample.shownCode), before ? [0, 0, 0] : topCodes);
    for (const sample of samples) assert.ok(sample.backgrounds.some((src) => src.includes(before ? 'card_back.jpg' : sample.nativeCode + '.jpg')));
    report.reveal = samples;
    report.revealImageRequests = imageRequests.slice(requestsBefore);
    report.revealStateAfter = await page.evaluate(() => window.__rule.stores.cardStore.inner.map((card) => ({ code: card.code, position: card.location.position, confirmedDeckCode: card.confirmedDeckCode })));
    assert.ok(report.revealStateAfter.every((card) => card.code === 0), 'Temporary reveal must not permanently expose deck identities');
    assert.ok(report.revealStateAfter.every((card) => card.confirmedDeckCode === undefined && card.position === 3), 'Confirmation must remove its display identity and preserve facedown position');
    await expect.poll(() => page.locator('[data-testid="duel-card"][data-card-zone="DECK"]').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.cardCode)))).toEqual([0, 0, 0]);
    assert.equal(await page.evaluate(() => window.__rule.stores.cardStore.deckReversed), false);
    const select = [0, 0, 1, 1, 3, ...[...topCodes].reverse().flatMap((code, i) => [...u32(code), 0, 1, i, 8])];
    await page.evaluate((bytes) => { window.__rule.packets.length = 0; window.__rule.selection = window.__rule.send(15, bytes); }, select);
    const options = page.locator('[data-testid="duel-select-cards-modal"]:visible [data-testid="duel-select-card-option"]');
    await expect(options).toHaveCount(3);
    assert.deepEqual(await options.evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.cardCode))), [...topCodes].reverse());
    await page.screenshot({ path: `${folder}/${name}-pot-candidates.png` });
    await options.nth(1).locator('.ant-pro-checkcard').click();
    if (await page.getByTestId('duel-card-panel-close').isVisible()) await page.getByTestId('duel-card-panel-close').click();
    await page.locator('[data-testid="duel-select-card-submit"]:visible').click();
    await page.evaluate(() => window.__rule.selection);
    assert.deepEqual(await page.evaluate(() => window.__rule.packets), [[3, 0, 1, 1, 1]]);
    await page.evaluate(() => {
      window.__rule.stores.cardStore.inner = [window.__rule.card(0, 0, 46986414)];
      window.__rule.samples.length = 0;
    });
    await expect(page.locator('[data-testid="duel-card"][data-card-zone="DECK"]')).toHaveCount(1);
    await page.evaluate((bytes) => window.__rule.send(30, bytes), [0, 1, ...u32(0), 0, 1, 0]);
    assert.deepEqual((await page.evaluate(() => window.__rule.samples)).map((sample) => sample.shownCode), [0], 'Zero-code confirmation must never reveal an identity cached by the client');
    const failedReveal = await page.evaluate(async (bytes) => {
      window.__rule.failFocus = true;
      let error;
      try { await window.__rule.send(30, bytes); } catch (e) { error = e.message; }
      finally { window.__rule.failFocus = false; }
      const card = window.__rule.stores.cardStore.inner[0];
      return { error, confirmedDeckCode: card.confirmedDeckCode, code: card.code, position: card.location.position };
    }, [0, 1, ...u32(89631139), 0, 1, 0]);
    assert.equal(failedReveal.error, 'Synthetic focus failure');
    assert.equal(failedReveal.confirmedDeckCode, undefined, 'A failed presentation must release its temporary identity');
    assert.equal(failedReveal.position, 3);
    await expect(page.locator('[data-testid="duel-card"][data-card-zone="DECK"]')).toHaveAttribute('data-card-code', '0');
    report.privacy = { zeroCodeCachedIdentityHidden: true, failedRevealCleanup: true };
    assert.deepEqual(errors, []);
    results.push(report);
    console.log(JSON.stringify(report));
    await context.close();
  }
  writeFileSync(`${folder}/report.json`, JSON.stringify(results, null, 2));
} finally { await browser?.close(); await server?.close(); }
