import assert from "node:assert/strict";
import { createServer } from "vite";
const vite = await createServer({
  server: { middlewareMode: true, watch: null, hmr: false },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { parseQuery } = await vite.ssrLoadModule("/src/replay/messages.ts");
  const values = [28, 0xf00, 2500, 1600, 1800, 2000];
  values[0] = values.length * 4;
  const bytes = new Uint8Array(values.length * 4),
    view = new DataView(bytes.buffer);
  values.forEach((n, i) => view.setInt32(i * 4, n, true));
  const parsed = parseQuery(bytes, 0, 4)[0];
  assert.equal(
    parsed.baseAttack,
    1800,
    "Core query must preserve original ATK separately",
  );
  assert.equal(parsed.baseDefense, 2000);
  const identityWords = [32, 0xfc, 46986414, 33, 4, 0, 32, 2];
  const identityBytes = new Uint8Array(32),
    identityView = new DataView(identityBytes.buffer);
  identityWords.forEach((n, i) => identityView.setInt32(i * 4, n, true));
  const identity = parseQuery(identityBytes, 0, 4)[0];
  assert.equal(
    identity.currentCode,
    46986414,
    "Current name query is separate from printed code",
  );
  assert.equal(identity.attribute, 32);
  assert.equal(identity.race, 2);
  const { updateOnlineIdentity } = await vite.ssrLoadModule(
    "/src/variant/cardIdentity.ts",
  );
  const changed = {
    meta: { data: { type: 17, level: 8, race: 8192, attribute: 16 } },
  };
  updateOnlineIdentity(changed, {
    queryFlags: 0xfc,
    alias: 46986414,
    type_: 33,
    level: 4,
    rank: 0,
    attribute: 32,
    race: 2,
  });
  assert.deepEqual(changed, {
    meta: { data: { type: 33, level: 4, race: 2, attribute: 32 } },
    currentCode: 46986414,
    rank: 0,
  });
  updateOnlineIdentity(changed, {
    queryFlags: 0x10,
    level: 0,
    type_: 0,
    alias: 0,
  });
  assert.equal(changed.meta.data.level, 0);
  assert.equal(changed.meta.data.type, 33);
  assert.equal(changed.currentCode, 46986414);
  updateOnlineIdentity(changed, { queryFlags: 4, alias: 89631139 });
  assert.equal(
    changed.currentCode,
    89631139,
    "Core can restore the printed name",
  );
  updateOnlineIdentity(changed, { queryFlags: 8, type_: 17 });
  assert.equal(changed.meta.data.type, 17, "Effect type can return to normal");
  const {
    statTrend,
    statText,
    showPrintedStats,
    updateOnlineStats,
    placeFieldStats,
  } = await vite.ssrLoadModule("/src/variant/cardStats.ts");
  assert.equal(statTrend(2500, 1800), "higher");
  assert.equal(statTrend(1600, 2000), "lower");
  assert.equal(statTrend(0, 0), "equal");
  assert.equal(
    statTrend(3000, 3000),
    "equal",
    "Printed ATK is not the comparison baseline",
  );
  for (const unknown of [undefined, -1, -2, NaN, Infinity]) {
    assert.equal(statText(unknown), "?");
    assert.equal(statTrend(2500, unknown), "unknown");
  }
  assert.equal(statText(0), "0");
  assert.equal(
    showPrintedStats({
      attack: 3000,
      baseAttack: 3000,
      printedAttack: 1800,
      defense: 0,
      baseDefense: 0,
      printedDefense: 0,
    }),
    true,
  );
  assert.equal(
    showPrintedStats({ attack: 2500, baseAttack: 1800, printedAttack: 1800 }),
    false,
  );
  assert.equal(showPrintedStats({ attack: 2500, printedAttack: 1800 }), true);
  const card = { meta: { data: { atk: 1800, def: 2000 } } };
  updateOnlineStats(card, {
    queryFlags: 0xf00,
    attack: 2500,
    defense: 1600,
    base_attack: 1800,
    base_defense: 2000,
  });
  assert.equal(card.baseAttack, 1800);
  assert.equal(card.baseDefense, 2000);
  assert.equal(card.meta.data.atk, 2500);
  updateOnlineStats(card, {
    queryFlags: 0x100,
    attack: 0,
    base_attack: 52428,
    base_defense: 52428,
  });
  assert.equal(
    card.baseAttack,
    1800,
    "Missing base flags preserve the previous original value",
  );
  assert.equal(card.meta.data.atk, 0);
  updateOnlineStats(card, { queryFlags: 0x400, base_attack: -2 });
  assert.equal(statText(card.baseAttack), "?");
  const other = { meta: { data: { atk: 1800 } } };
  updateOnlineStats(other, { attack: 2000, base_attack: 0 });
  assert.equal(
    other.baseAttack,
    undefined,
    "Legacy default zero is not an authoritative base value",
  );
  const rect = { x: 100, y: 100, width: 70, height: 100 },
    clip = { x: 0, y: 0, width: 600, height: 600 };
  assert.ok(placeFieldStats(rect, [], clip, 60));
  assert.ok(
    placeFieldStats(rect, [], clip, 90, 130),
    "A wider empty monster column can accommodate the complete label",
  );
  assert.equal(
    placeFieldStats(
      rect,
      [{ x: 100, y: 210, width: 70, height: 100 }],
      clip,
      60,
    ),
    undefined,
    "Insufficient space below hides entire label",
  );
  assert.equal(
    placeFieldStats(rect, [], clip, 90),
    undefined,
    "Text cannot spill out of its monster column",
  );
  assert.equal(
    placeFieldStats(rect, [], { ...clip, height: 210 }, 65),
    undefined,
    "Do not clip or overlap controls outside the board",
  );
  assert.equal(
    showPrintedStats({ attack: 3000, baseAttack: 3000, printedAttack: -2 }),
    true,
    "A printed question mark is still a different printed value",
  );
  console.log(
    "PASS card stats: original query, current/base/printed, unknown and zero, partial updates, measured label space",
  );
} finally {
  await vite.close();
}
