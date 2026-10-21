// Actual locked Core and published card script c17092736 (Ancient Telescope).
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
const folder = '.audit-tmp/practice-results-ui';
mkdirSync(folder, { recursive: true });
let server, browser;
try {
  server = process.env.SMOKE_URL ? undefined : await preview({build:{outDir:process.env.PRACTICE_TEST_DIST || 'dist'},preview:{host:'127.0.0.1',port:0}});
  const origin = process.env.SMOKE_URL || server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  for (const [width, height] of [[1280, 800], [844, 390], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('language', 'cn');
      const Native = Worker;
      window.Worker = class extends Native {
        constructor(...args) { super(...args); this.addEventListener('message', ({ data }) => { if (data.type === 'frame') window.__resultFrame = data.frame; }); }
      };
    });
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
      await page.evaluate(() => new Promise((resolve, reject) => {
        const opening = indexedDB.open('decks'); opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result, tx = db.transaction('decks', 'readwrite'), decks = tx.objectStore('decks');
          decks.clear(); decks.put({ deckName: 'Native number result', main: Array(40).fill(17092736), extra: [], side: [] }, 'Native number result');
          tx.oncomplete = () => { db.close(); resolve(); };
        };
      }));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
      await page.evaluate(()=>location.hash='#/practice');
      await page.waitForFunction(() => window.__resultFrame?.pending?.kind === 'idle', null, { timeout: 60000 });
      await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
      await page.locator('[data-testid="practice-card-action"][data-action="5"]:visible').click();
      await page.locator('[data-testid="practice-slot"][data-selectable="true"][data-sequence="2"]').click();
      await page.waitForFunction(() => window.__resultFrame?.pending?.message === 143);
      await page.getByTestId('practice-choices').locator('button[data-index="0"]').click();
      const feedback = page.getByTestId('practice-feedback');
      await expect(feedback).toContainText('宣言数字');
      await expect(feedback).toContainText('1');
      const strip = await feedback.boundingBox();
      assert.equal(await feedback.evaluate((element) => getComputedStyle(element).pointerEvents), 'none');
      if (width < height) {
        const life = await page.locator('.practice-life-bars').boundingBox();
        assert.ok(strip.y + strip.height <= life.y + 1, 'Portrait result strip stays above LP and the field');
      } else {
        const title = await page.locator('.practice-session-title').boundingBox();
        const rail = await page.locator('.practice-session-rail').boundingBox();
        assert.ok(strip.y + strip.height <= title.y + 1, 'Result strip stays above the rail title and controls');
        assert.ok(strip.x >= rail.x && strip.x + strip.width <= rail.x + rail.width, 'Result strip follows the actual 220/280px rail');
      }
      await page.screenshot({ path: `${folder}/number-result-${width}.png` });
      await page.getByTestId('practice-history').click();
      const result = page.getByTestId('practice-history-content').locator('[data-history-kind="result"]');
      await expect(result).toContainText('宣言数字');
      await expect(result).toContainText('1');
      if (width === 1280) for (const [language, label, title] of [['en', 'English', 'Declared number'], ['ja', '日本語', '宣言した数値'], ['ko', '한국어', '선언한 수치']]) {
        await page.locator('.ant-drawer-close:visible').click();await page.getByTestId('practice-settings').click();await page.getByTestId('settings-navigation').getByRole('button').last().click();
        await page.locator('.ant-modal:visible .ant-select').click();
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).click();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('language'))).toBe(language);
        await page.getByTestId('settings-close').click();
        await page.getByTestId('practice-history').click();await expect(result).toContainText(title);
        await expect(result).toContainText('1');
      }
      assert.deepEqual(errors, []);
      console.log('PASS actual Core number declaration toast, reserved feedback geometry, history and localization', width, height);
    } catch (error) { await page.screenshot({ path: `${folder}/failure-${width}.png` }); throw error; }
    finally { await page.close(); }
  }
} finally { await browser?.close(); await server?.httpServer.close(); }
