import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const ui = await vite.ssrLoadModule("/src/stores/fieldSelectionStore.ts");
  const spot = { player: 1, location: 8, sequence: 2 };
  const key = ui.fieldSpotKey(spot);
  const entry = { key, spot, selected: false };
  assert.deepEqual(ui.onlineFieldSpot({ controller: 1, zone: 3, sequence: 2 }), spot);
  assert.deepEqual(ui.onlineFieldSpot({ controller: 0, zone: 8, sequence: 0 }), { player: 0, location: 8, sequence: 5 });
  assert.equal(ui.onlineFieldSpot({ controller: 0, zone: 2, sequence: 0, is_overlay: true }), undefined);
  for (const zone of [0, 1, 4, 5, 6, 7]) assert.equal(ui.onlineFieldSpot({ controller: 0, zone, sequence: 0 }), undefined);

  const calls = [];
  const controller = new AbortController();
  const first = ui.bindFieldSelection([entry], (value) => calls.push(value), controller.signal);
  assert.equal(ui.fieldSelectionStore.active, true);
  assert.equal(ui.toggleFieldSelection("not-a-candidate"), false);
  assert.equal(ui.toggleFieldSelection(key), true);
  assert.deepEqual(calls, [key]);
  assert.equal(ui.fieldSelectionStore.entries[0].selected, false, "Only the owner changes the draft");
  first.update([{ ...entry, selected: true }]);
  assert.equal(ui.fieldSelectionStore.entries[0].selected, true);
  ui.focusFieldSelection(key);
  assert.equal(ui.fieldSelectionStore.focused, key);
  controller.abort();
  assert.equal(ui.fieldSelectionStore.active, false);
  assert.equal(ui.fieldSelectionStore.focused, "");
  assert.equal(ui.fieldSelectionStore.entries.length, 0);
  assert.equal(ui.toggleFieldSelection(key), false);

  const next = ui.bindFieldSelection([{ ...entry, selected: true, fixed: true }], () => assert.fail("Fixed Core choices cannot be toggled"));
  assert.equal(ui.toggleFieldSelection(key), true);
  first.update([]);
  first.release();
  assert.equal(ui.fieldSelectionStore.active, true, "An old modal cannot clear a newer request");
  assert.equal(ui.fieldSelectionStore.entries.length, 1);
  next.release();
  assert.equal(ui.fieldSelectionStore.active, false);
  ui.bindFieldSelection([entry], () => assert.fail("Aborted connection must not accept input"), controller.signal);
  assert.equal(ui.fieldSelectionStore.active, false);
  assert.equal(ui.toggleFieldSelection(key), false);
  ui.clearFieldSelection();
  console.log("Field selection session: lifecycle, stale owner, fixed choices, abort, and zone mapping passed");
} finally {
  await vite.close();
}
