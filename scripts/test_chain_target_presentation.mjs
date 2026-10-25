import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { disabled: true }, logLevel: 'error' });
try {
  const { seedScene } = await vite.ssrLoadModule('/src/ui/Shared/DuelBoard/scene.ts');
  const { advancePracticeScene } = await vite.ssrLoadModule('/src/ui/Practice/presentation.ts');
  const card = (location, sequence, player = 0) => ({ code: 46986414, player, location, sequence, position: 1, type: 1, attack: 1000, defense: 1000, level: 4, rank: 0, overlay: [], counters: [] });
  const frame = { step: 0, consumed: 0, total: 0, events: [], cards: [card(16, 0), card(16, 1), card(4, 2, 1)], lp: [8000, 8000], names: ['A', 'B'], turn: 1, phase: 4, turnPlayer: 0 };
  let scene = seedScene(frame);
  const advance = (events, cards = scene.cards) => (scene = advancePracticeScene({ ...frame, step: scene.step + 1, events, cards }, scene).scene);
  // The real Core sends CHAINING before the effect's target notification.
  scene.chains.push({ player: 0, location: 4, sequence: 2, code: 46986414, index: 1 });
  advance([[83, 1, 0, 16, 1, 1]]);
  assert.equal(scene.cards.find(c => c.location === 16 && c.sequence === 1).targeted, true, 'MSG_BECOME_TARGET must mark the exact duplicate, including outside the field');
  assert.equal(!!scene.cards.find(c => c.location === 16 && c.sequence === 0).targeted, false);
  advance([[73, 1]]);
  assert.equal(scene.cards.find(c => c.location === 16 && c.sequence === 1).targeted, true, 'A resolved link does not end the whole chain');
  advance([]);
  assert.equal(scene.cards.find(c => c.location === 16 && c.sequence === 1).targeted, true, 'A complete query cannot erase the live chain marker');
  const move = (from, to) => { const bytes = new Uint8Array(17); bytes[0] = 50; new DataView(bytes.buffer).setUint32(1, 46986414, true); bytes.set(from, 5); bytes.set(to, 9); return [...bytes]; };
  advance([move([0, 16, 0, 1], [0, 32, 0, 1])], [card(16, 0), card(32, 0), card(4, 2, 1)]);
  assert.equal(scene.cards.find(c => c.location === 16).targeted, true, 'Compacting another duplicate preserves the targeted instance');
  advance([move([0, 16, 0, 1], [0, 4, 0, 1])], [card(4, 0), card(32, 0), card(4, 2, 1)]);
  assert.equal(!!scene.cards.find(c => c.player === 0 && c.location === 4).targeted, false, 'Leaving a zone loses the old target relation');
  advance([[83, 1, 1, 4, 2, 1]]);
  advance([move([1, 4, 2, 1], [1, 4, 3, 1])], [card(4, 0), card(32, 0), card(4, 3, 1)]);
  assert.equal(scene.cards.find(c => c.player === 1).targeted, true, 'Moving across the monster zone preserves the card instance');
  advance([[74]]);
  assert.ok(scene.cards.every(c => !c.targeted), 'Chain end clears all target markers');
  const fresh = seedScene({ ...frame, cards: scene.cards.map(c => ({ ...c, targeted: true })) });
  assert.ok(fresh.cards.every(c => !c.targeted), 'Restart/seek must not inherit display-only chain targets');
  console.log('PASS exact chain target identity, duplicate compaction, query carry, movement and chain/restart cleanup');
} finally { await vite.close(); }
