import { expect } from '@playwright/test';

/** Keep the original regression goal while explicitly declining All's empty windows. */
export async function waitPastEmptyChains(page, predicate, arg = null, { trace = '__trace', timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await page.waitForFunction(predicate, arg, { timeout: Math.min(250, deadline - Date.now()) });
      return;
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
    }
    const pending = await page.evaluate((key) => window[key]?.last?.pending, trace);
    if (pending?.kind !== 'chain' || pending.choices.length || !pending.cancelable) continue;
    const choices = page.getByTestId('practice-choices');
    await expect(choices).toHaveAttribute('data-request-id', String(pending.id));
    await choices.getByTestId('practice-cancel').click();
    await page.waitForFunction(({ key, id }) => window[key]?.last?.pending?.id !== id, { key: trace, id: pending.id }, { timeout: Math.max(1, deadline - Date.now()) });
  }
  await page.waitForFunction(predicate, arg, { timeout: 1 });
}
