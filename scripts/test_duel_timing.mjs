import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import i18next from 'i18next';
import { createServer } from 'vite';

globalThis.window = { location: { href: 'http://127.0.0.1/?lang=cn', pathname: '/' } };
globalThis.localStorage = { getItem: () => 'cn' };
const vite = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { disabled: true }, logLevel: 'error' });
try {
  await i18next.init({ lng: 'cn', resources: { cn: JSON.parse(readFileSync('src/ui/I18N/Source/Chinese/translation.json', 'utf8')) } });
  const timing = await vite.ssrLoadModule('/src/variant/duelTiming.ts');
  const strings = await vite.ssrLoadModule('/src/api/strings.ts');
  const sqlite = await vite.ssrLoadModule('/src/middleware/sqlite/index.ts');
  const SQL = await initSqlJs({ wasmBinary: readFileSync(new URL(import.meta.resolve('sql.js/dist/sql-wasm.wasm'))) });
  sqlite.activateCardDatabase(new SQL.Database(readFileSync('resources-staging/1103/zh-CN/cards.cdb')));
  const translations = new Map();
  for (const line of readFileSync('resources-staging/1103/zh-CN/strings.conf', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(!\S+)\s+(\S+)\s+(.*)$/);
    if (match) translations.set(`${match[1]}_${match[2]}`, match[3]);
  }
  strings.activateStrings(translations);
  const sys = (id) => strings.fetchStrings(strings.Region.System, id);
  assert.equal(timing.battleTimingLabel(timing.corePhaseHint(8), 'cn'), '战斗阶段开始');
  assert.equal(timing.onlinePhaseHint(4), 28, 'Online protobuf ordinal 4 is native PHASE_BATTLE_START=8');
  assert.equal(timing.onlinePhaseHint(5), 24, 'Online ordinal 5 is native battle step');
  for (const id of [40, 41, 42, 43, 44]) {
    const context = timing.formatChainContext({ originMsg: id }, 0x2000, 0x4000, 'cn');
    assert.equal(context, sys(id), 'Damage subwindows must retain the exact HINT_EVENT, not collapse to a broad timing bit');
  }
  assert.equal(timing.formatChainContext(undefined, 0x40, 0, 'cn'), '怪兽召唤成功');
  assert.equal(timing.formatChainContext(undefined, 0, 0x80, 'cn'), '怪兽特殊召唤成功', 'hint1 must survive and be formatted independently');
  assert.equal(timing.formatChainContext(undefined, 0, 0x100, 'cn'), '怪兽反转召唤成功');
  const { fetchCard } = await vite.ssrLoadModule('/src/api/cards.ts');
  const name = fetchCard(64734921).text.name;
  const activationText = timing.formatChainContext({ originMsg: 1609, cardID: 64734921 }, 0, 0, 'cn');
  assert.ok(activationText.includes(name), 'System effect activation placeholder must contain its actual card name');
  assert.ok(!activationText.includes('%ls') && !activationText.includes('[?]'));
  assert.equal(timing.formatChainContext({ originMsg: 22 }, 0x40, 0, 'cn'), '怪兽召唤成功', 'A precise timing mask must replace a generic phase cause');
  assert.equal(timing.formatChainContext({ originMsg: 1609, cardID: 64734921 }, 0x40, 0, 'cn'), activationText, 'An effect activation is primary; a residual summon bit must not attach an unrelated old cause');
  assert.equal(timing.formatChainContext({ originMsg: 64734921 * 16 }, 0, 0x40, 'cn'), strings.getStrings(64734921 * 16), 'A packed native card description remains primary over a residual timing mask');
  for (const [message, originMsg] of [[60, '「[?]」通常召唤宣言时'], [62, '「[?]」特殊召唤宣言时'], [64, '「[?]」反转召唤宣言时']]) {
    const event = [message, ...new Uint8Array(new Uint32Array([64734921, 0x10400]).buffer)];
    assert.deepEqual(timing.advanceCoreTiming({ event: { originMsg: 1609, cardID: 98645731 } }, [event], () => undefined).event, { originMsg, cardID: 64734921 }, 'A summon-negation window must replace a prior effect cause before success');
  }
  assert.deepEqual(timing.advanceCoreTiming({ event: { originMsg: 1609, cardID: 64734921 } }, [[41, 8, 0]], () => undefined), { event: { originMsg: 28 }, battle: 28 }, 'Phase entry discards prior effect source');
  assert.deepEqual(timing.advanceCoreTiming({ event: { originMsg: 1609, cardID: 64734921 } }, [[11]], () => undefined).event, { originMsg: 22 }, 'Idle command discards prior effect source');
  assert.deepEqual(timing.advanceCoreTiming({ event: { originMsg: 1609, cardID: 64734921 } }, [[10]], () => undefined), { event: { originMsg: 24 }, battle: 24 }, 'Battle command discards prior effect source');

  const { PracticeEngine } = await vite.ssrLoadModule('/src/practice/engine.ts');
  const create = (await import(pathToFileURL(resolve('public/replay/706-v1/ocgcore.js')))).default;
  const core = await create({ wasmBinary: readFileSync('public/replay/706-v1/ocgcore.wasm'), printErr: () => {} });
  const engine = new PracticeEngine(core);
  engine.install(readFileSync('public/replay/706-v1/cards.data'), gunzipSync(readFileSync('public/replay/706-v1/scripts.data')));
  engine.setChainMode(0);
  const deck = { deckName: 'Timing native fixture', main: Array(40).fill(15025844), extra: [], side: [] };
  let frame = engine.open({ decks: [deck, deck], seed: [1, 2, 3, 4], rules: 2, hand: 5, noShuffle: true });
  let state = {};
  const history = [];
  const windows = [];
  const advance = () => {
    for (let step = 0; step < 1500; step++) {
      frame = engine.next();
      for (const event of frame.events) {
        state = timing.advanceCoreTiming(state, [event], (player, location, sequence) => frame.cards.find((card) => card.player === player && card.location === location && card.sequence === sequence)?.code);
        if ([2, 41, 60, 61, 62, 63, 64, 65, 70, 110, 113, 114].includes(event[0])) history.push({ raw: event, state: structuredClone(state), turn: frame.turn, phase: frame.phase });
      }
      if (frame.pending) {
        if (frame.pending.kind === 'chain') {
          const raw = Buffer.from(frame.events.find((event) => event[0] === 16));
          assert.equal(frame.pending.hint0, raw.readUInt32LE(4), 'First timing word must exactly match this native response packet');
          assert.equal(frame.pending.hint1, raw.readUInt32LE(8), 'Second timing word must exactly match this native response packet');
          windows.push({ request: structuredClone(frame.pending), state: structuredClone(state), text: timing.formatChainContext(state.event, frame.pending.hint0, frame.pending.hint1, 'cn') });
        }
        return frame.pending;
      }
    }
    throw Error('No native timing request');
  };
  const respond = (answer) => {
    assert.equal(engine.respond(frame.pending.id, frame.pending.player, answer), true, JSON.stringify(frame.pending));
    return advance();
  };
  const toCommand = (kind) => {
    for (let step = 0; step < 300; step++) {
      const p = frame.pending;
      if (p.kind === kind) return p;
      assert.equal(p.kind, 'chain', 'Only empty optional chain requests should precede the target command');
      assert.equal(p.cancelable, true);
      respond(-1);
    }
    throw Error('No command ' + kind);
  };
  const evaluate = (source) => {
    const bytes = Buffer.from(source + '\0');
    const p = core._malloc(bytes.length);
    core.HEAPU8.set(bytes, p);
    try { assert.equal(core._replay_evaluate(engine.handle, p), 1, core.UTF8ToString(core._replay_error())); }
    finally { core._free(p); }
  };
  advance();
  toCommand('idle');
  evaluate(`Debug.AddCard(46986414,1,1,LOCATION_MZONE,0,POS_FACEUP_ATTACK)
    Debug.AddCard(15025844,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)`);
  respond(7);
  toCommand('idle');
  assert.equal(frame.turn, 2);
  respond(6);
  const battle = toCommand('battle');
  assert.equal(state.battle, 24, 'PHASE_BATTLE_START must settle to normal battle after the response window');
  const attack = battle.choices.find((choice) => choice.action === 1 && choice.code === 46986414);
  assert.ok(attack, 'Native attack command must exist');
  respond(attack.value);
  for (let step = 0; step < 400; step++) {
    const p = frame.pending;
    if (p.kind === 'battle') break;
    if (p.kind === 'chain') respond(-1);
    else if (p.kind === 'cards') respond([p.choices[0].index]);
    else if (p.kind === 'yesno') respond(1);
    else throw Error('Unexpected attack prompt ' + JSON.stringify(p));
  }
  const battleHintIDs = history.filter((entry) => entry.raw[0] === 2 && entry.raw[1] === 1).map((entry) => Buffer.from(entry.raw).readUInt32LE(3));
  assert.deepEqual([...new Set(battleHintIDs.filter((id) => id >= 40 && id <= 44))], [40, 41, 42, 43, 44], 'One real Core attack must emit each damage subwindow in order');
  for (const id of [40, 41, 42, 43, 44]) {
    const matching = history.filter((entry) => entry.raw[0] === 2 && entry.raw[1] === 1 && Buffer.from(entry.raw).readUInt32LE(3) === id);
    assert.ok(matching.every((entry) => entry.state.battle === id && entry.state.event.originMsg === id));
  }
  assert.ok(history.some((entry) => entry.raw[0] === 41 && entry.raw[1] === 8 && entry.state.battle === 28));
  assert.ok(history.some((entry) => entry.raw[0] === 110 && entry.state.battle === 'attack'));
  assert.equal(state.battle, 24, 'Damage-step end returns to normal battle');
  assert.ok(windows.some((entry) => (entry.request.hint0 | entry.request.hint1) & 0x1000), 'Native attack timing hints must be retained');
  assert.ok(windows.some((entry) => entry.request.hint1 !== 0), 'At least one native response window must retain a nonzero second timing word');
  const folder = '.audit-tmp/duel-timing';
  mkdirSync(folder, { recursive: true });
  writeFileSync(folder + '/native-battle.json', JSON.stringify({ history, windows }, null, 2));
  const battleResult = { battleHintIDs, nativeWindows: windows.length, retainedHint1: windows.filter((entry) => entry.request.hint1).length };
  const begin = (main = deck.main) => {
    history.length = 0; windows.length = 0; state = {};
    frame = engine.open({ decks: [{ ...deck, main }, deck], seed: [1, 2, 3, 4], rules: 2, hand: 5, noShuffle: true });
    advance(); toCommand('idle');
  };
  const finishAction = () => {
    for (let step = 0; step < 200; step++) {
      const p = frame.pending;
      if (p.kind === 'idle') return;
      if (p.kind === 'chain') respond(-1);
      else if (p.kind === 'place' || p.kind === 'cards') respond([p.choices[0].index]);
      else if (p.kind === 'position') respond(p.choices[0].value);
      else if (p.kind === 'yesno') respond(1);
      else throw Error('Unexpected native summon prompt ' + JSON.stringify(p));
    }
    throw Error('Native action did not return to idle');
  };
  const checkSuccess = (message, systemID, bit) => {
    assert.ok(history.some((entry) => entry.raw[0] === message && entry.state.event.originMsg === systemID), 'Real native success must replace the declaration source');
    const responseWindow = windows.find((entry) => entry.state.event?.originMsg === systemID && ((entry.request.hint0 | entry.request.hint1) & bit));
    assert.ok(responseWindow, 'Real summon success timing hints must be retained');
    assert.equal(responseWindow.text, sys(systemID));
  };
  const saveScenario = (name) => {
    writeFileSync(folder + '/' + name + '.json', JSON.stringify({ history, windows }, null, 2));
    return { name, messages: history.map((entry) => entry.raw[0]), windows: windows.map((entry) => entry.text) };
  };
  const summons = [];
  begin();
  evaluate('Debug.AddCard(41420027,1,1,LOCATION_SZONE,0,POS_FACEDOWN_DEFENSE)');
  respond(frame.pending.choices.find((choice) => choice.action === 0).value);
  finishAction();
  const declaration = windows.find((entry) => entry.state.event?.originMsg === '「[?]」通常召唤宣言时');
  assert.ok(declaration, 'A real Solemn Judgment response window precedes MSG_SUMMONED');
  assert.ok(declaration.text.includes(fetchCard(15025844).text.name) && declaration.text.includes('通常召唤宣言时'));
  checkSuccess(61, 1604, 0x40);
  summons.push(saveScenario('native-normal-summon'));

  begin();
  evaluate(`Debug.AddCard(15025844,0,0,LOCATION_MZONE,0,POS_FACEDOWN_DEFENSE)
    Debug.AddCard(41420027,1,1,LOCATION_SZONE,0,POS_FACEDOWN_DEFENSE)`);
  respond(7); toCommand('idle');
  respond(7); toCommand('idle');
  assert.equal(frame.turn, 3);
  const flip = frame.pending.choices.find((choice) => choice.action === 2 && choice.location === 4 && choice.code === 15025844);
  assert.ok(flip, 'Native flip summon must be offered on the next A turn');
  respond(flip.value); finishAction();
  assert.ok(windows.some((entry) => entry.state.event?.originMsg === '「[?]」反转召唤宣言时' && entry.text.includes('反转召唤宣言时')), 'A real flip-negation window must name its current declaration');
  checkSuccess(65, 1608, 0x100);
  summons.push(saveScenario('native-flip-summon'));

  begin([64734921, ...Array(5).fill(15025844), 39552864, ...Array(33).fill(15025844)]);
  respond(frame.pending.choices.find((choice) => choice.action === 0 && choice.code === 64734921).value); finishAction();
  respond(frame.pending.choices.find((choice) => choice.action === 5 && choice.code === 64734921).value); finishAction();
  assert.ok(history.some((entry) => entry.raw[0] === 62 && entry.state.event.originMsg === '「[?]」特殊召唤宣言时'));
  assert.ok(history.some((entry) => entry.raw[0] === 70 && entry.state.event.originMsg === 1609 && entry.state.event.cardID === 64734921));
  const effectWindow = windows.find((entry) => entry.state.event?.originMsg === 1609 && entry.state.event.cardID === 64734921);
  assert.ok(effectWindow, 'The native Venus activation must have a response window');
  assert.equal(effectWindow.text, activationText, 'A native effect source must not be combined with residual summon timing');
  checkSuccess(63, 1606, 0x80);
  summons.push(saveScenario('native-special-summon'));
  engine.close();
  console.log(JSON.stringify({ passed: true, activationText, ...battleResult, summons }));
} finally { await vite.close(); }
