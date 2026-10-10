import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const exports = {};
const document = new EventTarget();
document.hidden = false;
let now = 0, serial = 0;
const timers = new Map();
const scope = {
  exports, module: { exports }, document,
  performance: { now: () => now }, WeakMap, Promise,
  setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id; },
  clearTimeout(id) { timers.delete(id); },
};
async function load(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, format: "cjs",
    platform: "browser", tsconfig: "tsconfig.json",
  });
  const own = {};
  const context = { ...scope, exports: own, module: { exports: own } };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}
const tick = async (ms) => {
  const target = now + ms;
  for (;;) {
    const pending = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at);
    if (!pending.length) break;
    const [id, timer] = pending[0];
    now = timer.at; timers.delete(id); timer.fn();
    await Promise.resolve();
  }
  now = target;
  await Promise.resolve();
};
const { getRevealHoldDuration } = await load("src/variant/duelAnimation.ts");
assert.equal(getRevealHoldDuration(0.7), 650);
assert.equal(getRevealHoldDuration(0), 1000);
assert.equal(getRevealHoldDuration(1), 500);
for (const speed of [-99, 99, NaN, Infinity])
  assert.ok(getRevealHoldDuration(speed) >= 500 && getRevealHoldDuration(speed) <= 1000);

const { waitForDuelDelay } = await load("src/service/duel/presentation.ts");
let resolved = false;
const first = waitForDuelDelay(650).then(() => resolved = true);
await tick(649); assert.equal(resolved, false);
await tick(1); await first; assert.equal(resolved, true);
resolved = false;
const background = waitForDuelDelay(650).then(() => resolved = true);
await tick(250);
document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
await tick(5000); assert.equal(resolved, false, "Background time must not consume the readable pause");
document.hidden = false; document.dispatchEvent(new Event("visibilitychange"));
await tick(399); assert.equal(resolved, false);
await tick(1); await background; assert.equal(resolved, true);
document.hidden = true;
const controller = new AbortController();
resolved = false;
const aborted = waitForDuelDelay(650, controller.signal).then(() => resolved = true);
assert.equal(timers.size, 0);
controller.abort(); await aborted;
assert.equal(resolved, true, "Leaving the duel releases a background reveal");
await waitForDuelDelay(650, controller.signal);
await waitForDuelDelay(0);
assert.equal(timers.size, 0);
console.log("PASS readable reveal: speed bounds, normal 650ms, foreground time and cancellation cleanup");
