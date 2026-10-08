import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { parseQuery } = await server.ssrLoadModule("/src/replay/messages.ts");
  const state = await server.ssrLoadModule("/src/ui/Replay/cardState.ts");
  const flags =
    1 | 2 | 8 | 0x100 | 0x200 | 0x10000 | 0x20000 | 0x40000 | 0x80000;
  const data = [
    0,
    flags,
    46986414,
    (8 << 24) | (2 << 16) | (4 << 8),
    1,
    2500,
    2100,
    2,
    89631139,
    46986414,
    2,
    (3 << 16) | 1,
    (2 << 16) | 0x1002,
    1,
    1,
  ];
  data[0] = data.length * 4;
  const [card] = parseQuery(new Uint8Array(new Uint32Array(data).buffer), 0, 4);
  assert.equal(card.sequence, 2);
  assert.equal(card.owner, 1);
  assert.equal(card.status, 1);
  assert.deepEqual(card.overlay, [89631139, 46986414]);
  assert.deepEqual(state.replayCounters(card), [
    { type: 1, count: 3 },
    { type: 0x1002, count: 2 },
  ]);
  assert.equal(state.positionLabel(card, "cn"), "里侧 · 守备表示");
  assert.equal(state.isDefense(card), true);
  assert.equal(state.concealReplayCard(card, false), true);
  assert.equal(state.concealReplayCard(card, true), false);
  assert.equal(
    state.positionLabel({ ...card, position: 2 }, "cn"),
    "里侧 · 攻击表示",
  );
  assert.equal(state.isDefense({ ...card, position: 2 }), false);
  assert.equal(
    state.positionLabel({ ...card, position: 4 }, "cn"),
    "表侧 · 守备表示",
  );
  assert.equal(
    state.positionLabel({ ...card, location: 32 }, "cn"),
    "里侧 · 除外",
  );
  assert.equal(state.positionLabel({ ...card, location: 8 }, "cn"), "盖放");
  assert.equal(state.isDefense({ ...card, location: 32 }), false);
  assert.equal(state.concealReplayCard({ ...card, location: 2 }, false), false);
  for (const language of ["cn", "en", "ja", "ko"])
    assert.ok(state.positionLabel(card, language));
  console.log(
    "Replay state: native query flags/counter encoding, face-down banish, defense, reveal, status and owner passed.",
  );
} finally {
  await server.close();
}
