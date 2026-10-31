import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { disabled: true }, logLevel: 'error' });
try {
  const { default: becomeTarget } = await vite.ssrLoadModule('/src/service/duel/becomeTarget.ts');
  const { seedScene } = await vite.ssrLoadModule('/src/ui/Shared/DuelBoard/scene.ts');
  const { advancePracticeScene } = await vite.ssrLoadModule('/src/ui/Practice/presentation.ts');
  const location = { controller: 0, zone: 4, sequence: 0 };
  const card = { code: 46986414, meta: { text: { name: 'Public fixture' } }, location, targeted: false };
  const context = { matStore: { chains: [] }, cardStore: { at: () => card }, historyStore: { putTargeted() {} } };
  const message = { locations: [location] };
  becomeTarget({ context }, message);
  assert.equal(card.targeted, false, 'An automatic hint outside a chain must not create an indefinitely retained chain target');
  assert.equal(card.targetFlash, 1, 'The source still receives a finite visual emphasis');
  becomeTarget({ context }, message);
  assert.equal(card.targetFlash, 2, 'Repeated automatic hints restart the finite emphasis');
  context.matStore.chains.push(location);
  becomeTarget({ context }, message);
  assert.equal(card.targeted, true, 'Real chain targets remain marked until chain end');

  const monster = { code: 46986414, player: 0, location: 4, sequence: 0, position: 1, type: 1, attack: 1000, defense: 1000, level: 4, rank: 0, overlay: [], counters: [] };
  const frame = { step: 0, consumed: 0, total: 0, events: [], cards: [monster], lp: [8000, 8000], names: ['A', 'B'], turn: 1, phase: 512, turnPlayer: 0 };
  let scene = seedScene(frame);
  const advance = events => (scene = advancePracticeScene({ ...frame, step: scene.step + 1, cards: scene.cards, events }, scene).scene);
  advance([[83, 1, 0, 4, 0, 1], [2, 4, 0, 138, 4, 0, 0]]);
  assert.equal(scene.cards[0].targeted, false, 'Practice EP processing has no chain end packet to clear a persistent marker');
  assert.equal(scene.cards[0].targetFlash, 1);
  advance([]);
  assert.equal(scene.cards[0].targetFlash, 1, 'Queries must not restart the same emphasis');
  advance([[83, 1, 0, 4, 0, 1]]);
  assert.equal(scene.cards[0].targetFlash, 2);
  scene.chains.push({ player: 0, location: 4, sequence: 0, code: 46986414, index: 1 });
  advance([[83, 1, 0, 4, 0, 1]]);
  assert.equal(scene.cards[0].targeted, true);
  advance([[73, 1]]);
  assert.equal(scene.cards[0].targeted, true, 'Resolving one link must retain actual chain targets');
  advance([[74]]);
  assert.equal(scene.cards[0].targeted, false);
  assert.equal(seedScene({ ...frame, cards: scene.cards }).cards[0].targetFlash, undefined, 'Restart/seek drops the old transient emphasis');
  console.log('PASS online/practice automatic emphasis, repeated hints, query carry, real chain retention and restart cleanup');
} finally {
  await vite.close();
}
