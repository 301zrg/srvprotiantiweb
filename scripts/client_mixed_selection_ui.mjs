import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { build, preview } from 'vite';

const folder = '.audit-tmp/client-mixed-selection-ui';
const outDir = process.argv.includes('--baseline') ? '.audit-tmp/client-target-selection-ui/web' : folder + '/web';
mkdirSync(folder, { recursive: true });
const base = readFileSync('scripts/client_followup_ui.mjs', 'utf8').match(/const fixture=`([\s\S]*?)`;\r?\nlet browser/)[1];
const prior = readFileSync('scripts/client_round4_ui.mjs', 'utf8').match(/const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/)[1];
let browser, server;
const report = [];
try {
  if (!process.argv.includes('--baseline') && !process.argv.includes('--built')) {
    await build({ logLevel: 'error', build: { outDir }, plugins: [{ name: 'mixed-selection-test-only', transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return code + base + prior; } }] });
    execFileSync(process.execPath, ['scripts/copy_assets.mjs', outDir], { stdio: 'inherit' });
  }
  server = await preview({ build: { outDir }, preview: { host: '127.0.0.1', port: 0 } });
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  for (const [width, height] of [[1440, 900], [844, 390], [390, 844], [320, 640]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 1000, isMobile: width < 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('language', 'cn'));
    try {
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
      await expect(page.locator('main[data-ready=true]')).toBeVisible({ timeout: 60000 });
      await page.evaluate(() => {
        window.__round4.online();
        const stores = window.__followup.stores;
        stores.cardStore.inner = stores.cardStore.inner.filter(c => ![2, 3, 4].includes(c.location.zone));
        for (const sequence of [0, 1, 2]) stores.cardStore.inner.push(window.__round4.card(46986414, 4, sequence));
        stores.cardStore.inner.push(window.__round4.card(26202165, 2, 3), window.__round4.card(46986414, 4, 0, 1));
        window.__followup.sent.length = 0;
        window.__mixedOpen = (extra = false) => {
          const choices = extra ? [[0, 64, 0], [0, 64, 1]] : [[0, 16, 1], [0, 4, 3], [0, 16, 0], [1, 16, 0], [0, 16, 2]];
          const bytes = new Uint8Array(6 + choices.length * 8);
          bytes.set([15, 0, 0, 1, 2, choices.length]);
          const data = new DataView(bytes.buffer);
          choices.forEach(([player, location, sequence], index) => {
            data.setUint32(6 + index * 8, location === 4 ? 26202165 : 46986414, true);
            bytes.set([player, location, sequence, 1], 10 + index * 8);
          });
          window.__round4.packet([...bytes]);
        };
        window.__round4.packet([83, 1, 0, 16, 1, 1]);
        window.__mixedOpen();
      });
      const modal = page.locator('[data-testid=duel-select-cards-modal]:visible');
      await expect(modal).toBeVisible();
      const candidates = modal.getByTestId('duel-select-card-option');
      await expect(candidates).toHaveCount(5);
      const geometry = await candidates.evaluateAll(nodes => nodes.map(node => {
        const candidate = node.getBoundingClientRect();
        const artwork = node.querySelector('[style*="--src"]').getBoundingClientRect();
        const container = node.parentElement.getBoundingClientRect(); return { container: { x: container.x, right: container.right }, candidate: { x: candidate.x, right: candidate.right }, artwork: { x: artwork.x, right: artwork.right } };
      }));
      await page.screenshot({ path: `${folder}/${width}-mixed.png` });
      for (const box of geometry) assert.ok(box.artwork.x >= Math.max(box.candidate.x,box.container.x) - 1 && box.artwork.right <= Math.min(box.candidate.right,box.container.right) + 1, 'Each mixed-zone artwork must fit its candidate, including desktop fallback cards');
      const grave = sequence => modal.locator(`[data-testid=duel-select-card-option][data-card-controller="0"][data-card-zone-value="4"][data-card-sequence="${sequence}"]`);
      await expect(grave(1)).toContainText(/墓地\s*\(2\)/);
      await expect(grave(0)).toContainText(/墓地\s*\(1\)/);
      await expect(grave(1).getByTestId('duel-selection-targeted')).toBeVisible();
      await expect(grave(0).getByTestId('duel-selection-targeted')).toHaveCount(0);
      await page.evaluate(() => window.__round4.packet([74]));
      await expect(grave(1).getByTestId('duel-selection-targeted')).toHaveCount(0);
      await page.evaluate(() => window.__round4.packet([83, 1, 0, 16, 0, 1]));
      await expect(grave(0).getByTestId('duel-selection-targeted')).toBeVisible();
      await grave(1).locator('.ant-pro-checkcard').click();
      await grave(0).locator('.ant-pro-checkcard').click();
      await expect(modal.getByTestId('duel-field-selection-summary')).toContainText(/墓地\s*\(2\)/);
      await page.locator('[data-testid=duel-select-card-submit]:visible').click();
      await expect.poll(() => page.evaluate(() => window.__followup.sent.length)).toBe(1);
      assert.deepEqual(await page.evaluate(() => window.__followup.sent[0]), [4, 0, 1, 2, 0, 2]);
      await page.evaluate(() => window.__mixedOpen(true));
      await expect(modal.getByTestId('duel-select-card-option')).toHaveCount(2);
      await expect(modal.getByTestId('duel-select-card-option').nth(1)).toContainText(/额外\s*\(2\)/);
      assert.deepEqual(errors, []);
      report.push({ width, height, passed: true });
      console.log('PASS mixed artwork bounds, original zone ordinals, live chain targets and exact response', width, height);
    } catch (error) {
      await page.screenshot({ path: `${folder}/${width}-failure.png` });
      throw error;
    } finally { await page.close(); }
  }
} finally {
  await browser?.close();
  await server?.httpServer.close();
  writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
}
