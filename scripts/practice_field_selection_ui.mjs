// Static production build only. The initial duel uses the real fixed Core;
// focused UI frames then exercise native choice addresses without changing Lua.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { waitPastEmptyChains } from './practice_empty_chain.mjs';

const server = process.env.SMOKE_URL ? undefined : await preview({ build: { outDir: process.env.PRACTICE_TEST_DIST || 'dist' }, preview: { host: '127.0.0.1', port: 0 } });
const origin = process.env.SMOKE_URL || server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const folder = '.audit-tmp/practice-field-selection';
mkdirSync(folder, { recursive: true });
const reports = [];
try {
  for (const [name, width, height] of [['desktop', 1280, 800], ['portrait', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, isMobile: name === 'portrait', hasTouch: name === 'portrait' });
    const errors = [];
    let sockets = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('websocket', () => sockets++);
    await page.addInitScript(() => {
      localStorage.setItem('language', 'cn');
      window.__fieldPractice = { workers: [], sent: [], last: undefined, fixture: false };
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.epoch = window.__fieldPractice.workers.length;
          window.__fieldPractice.workers.push(this);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'frame') {
              window.__fieldPractice.last = data.frame;
              window.__fieldPractice.epoch = this.epoch;
            }
          });
        }
        postMessage(data, ...args) {
          window.__fieldPractice.sent.push({ ...data, epoch: this.epoch });
          if (window.__fieldPractice.fixture && data.type === 'respond') return;
          super.postMessage(data, ...args);
        }
      };
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
      await page.evaluate(() => new Promise((resolve, reject) => {
        const request = indexedDB.open('decks');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('decks', 'readwrite');
          tx.objectStore('decks').clear();
          tx.objectStore('decks').put({ deckName: 'Field selection fixture', main: Array(40).fill(26202165), extra: [], side: [] }, 'Field selection fixture');
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
      await page.goto(origin + '/#/practice', { waitUntil: 'domcontentloaded' });
      await waitPastEmptyChains(page, () => window.__fieldPractice.last?.pending?.kind === 'idle', null, { trace: '__fieldPractice', timeout: 60000 });
      assert.equal(await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').count(), 6, 'Real MR2 Core first draw');
      const inject = async (id, { kind = 'cards', min = 1, max = 3, player = 1, choices, epoch } = {}) => {
        await page.evaluate(({ id, kind, min, max, player, choices, epoch }) => {
          const state = window.__fieldPractice;
          state.fixture = true;
          const options = choices || [
            { index: 7, player: 0, location: 4, sequence: 4, code: 26202165 },
            { index: 3, player: 0, location: 4, sequence: 0, code: 26202165 },
            { index: 9, player: 0, location: 4, sequence: 2, code: 26202165 },
            { index: 6, player: 1, location: 8, sequence: 0, code: 26202165 },
            { index: 2, player: 1, location: 8, sequence: 4, code: 26202165 },
          ];
          const cards = options.filter(c => c.location === 4 || c.location === 8).map(c => ({ ...c, attack: 1000, defense: 1000, type: c.location === 4 ? 1 : 2, level: 4, rank: 0, overlay: [], counters: [], position: c.player === 1 ? 8 : 1 }));
          const frame = { ...state.last, events: [], cards, pending: { id, message: kind === 'unselect' ? 26 : kind === 'sort' ? 25 : 15, kind, player, min, max, cancelable: true, choices: options } };
          state.workers[epoch ?? state.epoch].dispatchEvent(new MessageEvent('message', { data: { type: 'frame', frame } }));
        }, { id, kind, min, max, player, choices, epoch });
        await expect(page.getByTestId('practice-active-player')).toContainText(player === 0 ? 'A' : 'B');
      };
      const open = async () => {
        await page.getByTestId('practice-open-prompt').click();
        await expect(page.getByTestId('practice-choices')).toBeVisible();
        await expect(page.locator('.ant-modal').filter({ has: page.getByTestId('practice-choices') })).toHaveCSS('transform', 'none');
      };
      const candidate = index => page.getByTestId('practice-choices').locator(`button.practice-choice[data-index="${index}"]`);
      const boardCard = (player, location, sequence) => page.locator(`.practice-positioned-card[data-player="${player}"][data-location="${location}"][data-sequence="${sequence}"]`);
      const responseCount = () => page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').length);

      await inject(501);
      await open();
      await expect(page.getByTestId('practice-choices').getByTestId('practice-locate-card').first()).toBeVisible();
      const x = await Promise.all([3, 9, 7].map(async index => (await candidate(index).boundingBox()).x));
      assert.ok(x[0] < x[1] && x[1] < x[2], 'A candidates keep actual left-to-right 0/2/4 field positions');
      assert.ok(x[1] - x[0] > 1.6 * (await candidate(3).boundingBox()).width, 'Empty field slots are preserved');
      assert.ok((await candidate(2).boundingBox()).x < (await candidate(6).boundingBox()).x, 'B field positions mirror to the fixed screen view');
      const baseline = await responseCount();
      if (name === 'desktop') {
        await candidate(3).hover();
        await expect(boardCard(0, 4, 0)).toHaveAttribute('data-located', 'true');
        await page.getByTestId('practice-choices').locator('h2').hover();
      }
      assert.equal(await responseCount(), baseline, 'Hover does not submit a Core response');
      await candidate(9).click();
      await expect(boardCard(0, 4, 2)).toHaveAttribute('data-selected', 'true');
      await expect(candidate(9)).toHaveAttribute('aria-pressed', 'true');
      await page.getByTestId('practice-choices').locator('[data-index="9"]').locator('..').getByTestId('practice-locate-card').click();
      await expect(page.getByTestId('practice-page')).toHaveAttribute('data-prompt-minimized', 'true');
      await expect(boardCard(0, 4, 2)).toHaveAttribute('data-located', 'true');
      await expect(boardCard(0, 4, 2)).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
      assert.equal(await responseCount(), baseline, 'Locate and minimize do not submit a Core response');
      await page.screenshot({ path: `${folder}/${name}-located.png` });
      await expect(boardCard(0, 4, 2)).toHaveAttribute('data-located', 'false', { timeout: 3000 });
      await expect(boardCard(0, 4, 2)).toHaveCSS('outline-color', 'rgb(255, 224, 138)');
      await boardCard(0, 4, 0).click();
      await boardCard(0, 4, 2).click();
      await page.getByTestId('practice-return-selection').click();
      await expect(candidate(3)).toHaveAttribute('aria-pressed', 'true');
      await expect(candidate(9)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByTestId('practice-selected-positions')).toContainText('1');
      await page.screenshot({ path: `${folder}/${name}-grid.png` });
      await page.getByTestId('practice-confirm').click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1)), { type: 'respond', chainMode: 2, id: 501, player: 1, answer: [3], epoch: 0 }, 'Native player and original response index are retained');

      await inject(502, { min: 1, max: 1 });
      await open();
      await expect(candidate(3)).toHaveAttribute('aria-pressed', 'false');
      await expect(boardCard(0, 4, 0)).toHaveAttribute('data-located', 'false');
      await candidate(7).click();
      await page.getByTestId('practice-confirm').click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1).answer), [7], 'Single-card selection keeps its native index');

      const sortChoices = [4, 0, 2, 1, 3].map((sequence, index) => ({ index, player: 0, location: 4, sequence, code: 26202165 }));
      await inject(503, { kind: 'sort', min: 5, max: 5, choices: sortChoices });
      await expect(page.getByTestId('practice-choices')).toBeVisible();
      for (const index of [2, 0, 1, 4, 3]) await candidate(index).click();
      await page.getByTestId('practice-confirm').click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1).answer), [2, 0, 1, 4, 3], 'Visual position sorting must not sort the native answer order');

      await inject(504, { kind: 'unselect', min: 1, max: 3 });
      await open();
      await candidate(3).click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1).answer), [3], 'Unselect preserves its immediate native response');

      await inject(506, { min: 2, max: 3 });
      await open();
      await candidate(7).click();
      await candidate(3).click();
      await expect(candidate(7)).toHaveCSS('border-top-style', 'solid');
      await expect(boardCard(0, 4, 4).getByTestId('practice-selection-badge')).toContainText('✓');
      await page.getByTestId('practice-confirm').click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1).answer), [7, 3], 'Multi-card native answer order follows selection, not field sorting');

      await inject(507, { kind: 'unselect', choices: [{ index: 0, player: 1, location: 8, sequence: 0, code: 26202165, forced: true }] });
      await expect(boardCard(1, 8, 0)).toHaveAttribute('data-selected', 'true');
      await expect(page.locator('.practice-board-selected-positions')).toContainText('B');
      await boardCard(1, 8, 0).click();
      assert.deepEqual(await page.evaluate(() => window.__fieldPractice.sent.filter(m => m.type === 'respond').at(-1).answer), [0], 'Board unselect keeps immediate deselection of the Core selected group');

      await inject(505);
      await open();
      await candidate(3).click();
      await page.getByTestId('practice-choices').getByTestId('practice-locate-card').first().click();
      await page.getByTestId('practice-retry').click();
      await waitPastEmptyChains(page, () => window.__fieldPractice.epoch === 1 && window.__fieldPractice.last?.pending?.kind === 'idle', null, { trace: '__fieldPractice', timeout: 60000 });
      await page.evaluate(() => { window.__fieldPractice.fixture = true; });
      await inject(505, { epoch: 1 });
      await open();
      await expect(candidate(3)).toHaveAttribute('aria-pressed', 'false');
      await expect(boardCard(0, 4, 0)).toHaveAttribute('data-located', 'false');
      const responsesBeforeStale = await responseCount();
      await page.evaluate(() => {
        const state = window.__fieldPractice;
        state.workers[0].dispatchEvent(new MessageEvent('message', { data: { type: 'frame', frame: { ...state.last, pending: { ...state.last.pending, id: 999, player: 0 } } } }));
      });
      await expect(page.getByTestId('practice-choices')).toHaveAttribute('data-request-id', '505');
      assert.equal(await responseCount(), responsesBeforeStale, 'An old Worker frame cannot replace the live selection');
      const fixedA = await boardCard(0, 4, 0).boundingBox();
      const fixedB = await boardCard(1, 8, 0).boundingBox();
      assert.ok(fixedA.y > fixedB.y, 'A remains below B while player B is answering');
      assert.equal(sockets, 0);
      assert.deepEqual(errors, []);
      reports.push({ viewport: name, realCoreInitialDraw: 6, focusedFrames: 'public synthetic Worker frames after real fixed Core startup', focusedCases: ['sparse fixed-view grid', 'hover only', 'visible white locate frame without response', 'bidirectional selection', 'native index/player', 'single', 'multiple native indices', 'sort answer order', 'unselect immediate and native selected group', 'new request', 'new generation', 'stale Worker ignored'] });
      console.log('PASS practice field selection', name);
    } catch (error) {
      await page.screenshot({ path: `${folder}/${name}-failure.png` });
      throw error;
    } finally {
      writeFileSync(`${folder}/${name}-trace.json`, JSON.stringify(await page.evaluate(() => ({ sent: window.__fieldPractice?.sent, errors: window.__fieldPractice?.last?.error })), null, 2));
      await page.close();
    }
  }
  writeFileSync(`${folder}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
  await server?.httpServer.close();
}
