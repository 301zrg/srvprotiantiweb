// Read-only native 706 resource audit with synthetic, fully public duel fields.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';

const packed = readFileSync('public/replay/706-v1/scripts.data');
const scripts = gunzipSync(packed);
const indexSize = scripts.readUInt32LE(0);
const index = JSON.parse(scripts.subarray(4, 4 + indexSize));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = [97268402, 37742478, 27243130];
const resources = ids.map(id => {
  const entry = index.find(item => item.name.endsWith(`c${id}.lua`));
  assert.ok(entry);
  const bytes = scripts.subarray(4 + indexSize + entry.offset, 4 + indexSize + entry.offset + entry.bytes);
  const text = bytes.toString('utf8');
  const reset = text.slice(text.indexOf(`function c${id}.rstop`));
  assert.match(reset, /Duel\.HintSelection\(Group\.FromCards\(c\)\)/);
  assert.match(reset, /Duel\.Hint\(HINT_OPSELECTED,1-tp,1162\)/);
  return { id, name: entry.name, bytes: bytes.length, sha256: sha(bytes) };
});
const folder = '.audit-tmp/old-ruling-ep-core';
mkdirSync(folder, { recursive: true });

const vite = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { disabled: true }, logLevel: 'error' });
const results = [];
try {
  const { PracticeEngine } = await vite.ssrLoadModule('/src/practice/engine.ts');
  const { practiceHintResults } = await vite.ssrLoadModule('/src/practice/prompts.ts');
  const create = (await import(pathToFileURL(resolve('public/replay/706-v1/ocgcore.js')))).default;
  const core = await create({ wasmBinary: readFileSync('public/replay/706-v1/ocgcore.wasm'), printErr: text => console.error('CORE', text) });
  const engine = new PracticeEngine(core);
  engine.install(readFileSync('public/replay/706-v1/cards.data'), scripts);
  engine.setChainMode(0);
  const deck = { deckName: 'Synthetic EP audit', main: Array(40).fill(89631139), extra: [], side: [] };
  for (const id of ids) {
    const actor = id === 97268402 ? 1 : 0;
    const field = id === 97268402
      ? `Debug.AddCard(54719828,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)`
      : `Debug.AddCard(89631139,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)\nDebug.AddCard(89631139,1,1,LOCATION_MZONE,0,POS_FACEUP_ATTACK)`;
    let frame = engine.open({ decks: [deck, deck], seed: [11, 22, 33, 44], hand: 0, rules: 2, noShuffle: true });
    const lua = Buffer.from(`${field}\nDebug.AddCard(${id},${actor},${actor},LOCATION_HAND,0,POS_FACEDOWN_DEFENSE)\0`);
    const pointer = core._malloc(lua.length);
    core.HEAPU8.set(lua, pointer);
    assert.equal(core._replay_evaluate(engine.handle, pointer), 1, core.UTF8ToString(core._replay_error()));
    core._free(pointer);
    const trace = [], requests = [], cards = [];
    let activated = false, reset = false;
    for (let step = 0; step < 1000 && !reset; step++) {
      frame = engine.next();
      for (const raw of frame.events) {
        trace.push({ step, turn: frame.turn, phase: frame.phase, raw });
        assert.notEqual(raw[0], 1, 'every fixture response must be accepted without MSG_RETRY');
        if (raw[0] === 70 && Buffer.from(raw).readUInt32LE(1) === id) activated = true;
        if (raw[0] === 2 && raw[1] === 4 && Buffer.from(raw).readUInt32LE(3) === 1162) reset = true;
      }
      cards.push({ step, turn: frame.turn, phase: frame.phase, cards: frame.cards.filter(c => [4, 16].includes(c.location)).map(c => ({ code: c.code, player: c.player, location: c.location, sequence: c.sequence, attack: c.attack, status: c.status })) });
      if (reset) break;
      const p = frame.pending;
      if (!p) continue;
      let answer;
      if (p.kind === 'chain') {
        const effect = !activated && p.choices.find(c => c.code === id);
        answer = effect ? effect.value : p.cancelable ? -1 : p.choices[0]?.value;
      } else if (p.kind === 'yesno') answer = 1;
      else if (p.kind === 'idle') {
        const effect = !activated && id === 27243130 && p.choices.find(c => c.action === 5 && c.code === id);
        answer = effect ? effect.value : id === 37742478 && frame.turn >= 2 && p.player === 1 ? 6 : 7;
      } else if (p.kind === 'battle') {
        const attack = id === 37742478 && !activated && p.choices.find(c => c.action === 1);
        answer = attack ? attack.value : p.choices.find(c => c.action === 3)?.value;
      } else if (['cards', 'tribute', 'unselect', 'sum'].includes(p.kind)) answer = p.choices.slice(0, p.min || 1).map(c => c.index);
      else if (p.kind === 'place') answer = p.choices.slice(0, p.min).map(c => c.index);
      else if (p.kind === 'position' || p.kind === 'option') answer = p.choices[0].value;
      else if (p.kind === 'sort') answer = -1;
      else throw Error(`Unexpected request ${JSON.stringify(p)}`);
      requests.push({ step, turn: frame.turn, phase: frame.phase, request: p, answer });
      assert.equal(engine.respond(p.id, p.player, answer), true, JSON.stringify({ id, request: p, answer }));
    }
    const result = { id, actor, activated, reset, trace, requests, cards, practiceResults: practiceHintResults(trace.map(x => x.raw)) };
    results.push(result);
    writeFileSync(`${folder}/native.json`, JSON.stringify({ resource: { scriptsSha256: sha(packed), resources }, results }, null, 2));
    assert.ok(activated && reset, `Need actual card activation followed by actual End Phase reset for ${id}`);
    const ep = trace.filter(e => e.phase === 512);
    const epResults = ep.filter(e => e.raw[0] === 2 && e.raw[1] === 4);
    assert.equal(epResults.length, 1, 'one actual reset produces one public result');
    assert.deepEqual(epResults[0].raw, [2, 4, actor, 138, 4, 0, 0], 'the native hint contains actor, not its actual network recipient');
    const resetAt = trace.indexOf(epResults[0]);
    assert.deepEqual(trace[resetAt - 1].raw, [83, 1, actor, 16, 0, 5], 'the immediately preceding native selection identifies the effect source in its graveyard');
    assert.deepEqual(requests.filter(e => e.phase === 512), [], 'these uncontested resets are automatic and have no local choice to mirror');
    assert.deepEqual(result.practiceResults, [{ player: actor, result: { kind: 'option', value: 1162 } }], 'the existing practice result handler retains the real reset event');
    if (id !== 97268402) {
      const attacks = cards.flatMap(frame => frame.cards.filter(c => c.player === 0 && c.location === 4).map(c => c.attack));
      assert.ok(attacks.includes(id === 37742478 ? 6000 : 2200), 'the real Lua effect must apply before it resets');
      assert.equal(cards.at(-1).cards.find(c => c.player === 0 && c.location === 4)?.attack, 3000, 'the native reset restores the monster attack');
    }
    console.log(`PASS actual fixed 706 Core: ${id}, activation -> End Phase -> source selection + hint4/actor${actor}/1162; no EP response`);
    engine.close();
  }
} finally { await vite.close(); }
