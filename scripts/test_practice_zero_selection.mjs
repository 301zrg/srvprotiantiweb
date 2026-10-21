import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: 'error',
});
try {
  const { PracticeEngine } = await vite.ssrLoadModule('/src/practice/engine.ts');
  const { encodePracticeAnswer } = await vite.ssrLoadModule('/src/practice/prompts.ts');
  const { needsPracticePrompt } = await vite.ssrLoadModule('/src/practice/interactions.ts');
  const create = (await import(pathToFileURL(resolve('public/replay/706-v1/ocgcore.js')))).default;
  const core = await create({
    wasmBinary: readFileSync('public/replay/706-v1/ocgcore.wasm'),
    printErr: () => {},
  });
  const engine = new PracticeEngine(core);
  const scripts = gunzipSync(readFileSync('public/replay/706-v1/scripts.data'));
  engine.install(readFileSync('public/replay/706-v1/cards.data'), scripts);
  const indexLength = scripts.readUInt32LE(0);
  const index = JSON.parse(scripts.subarray(4, 4 + indexLength).toString());
  const shippedScript = (name) => {
    const entry = index.find((entry) => entry.name === name);
    assert.ok(entry, name);
    const data = scripts.subarray(4 + indexLength + entry.offset, 4 + indexLength + entry.offset + entry.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
    return { text: data.toString(), sha256: entry.sha256 };
  };
  const sky = shippedScript('c40044918.lua');
  assert.match(sky.text, /g:Select\(tp,0,ct,nil\)/);
  const pot = shippedScript('c98645731.lua');
  assert.match(pot.text, /Duel\.ConfirmDecktop\(p,3\)/);

  const normalDeck = { deckName: 'B normal', main: Array(40).fill(26202165), extra: [], side: [] };
  let frame;
  let events;
  const advance = () => {
    for (let step = 0; step < 2000; step++) {
      frame = engine.next();
      events.push(...frame.events);
      if (frame.pending) return frame.pending;
    }
    throw Error('No request');
  };
  const open = (main) => {
    events = [];
    frame = engine.open({
      decks: [{ deckName: 'A native card rule fixture', main, extra: [], side: [] }, normalDeck],
      seed: [1, 2, 3, 4], rules: 2, hand: 5, noShuffle: true,
    });
    advance();
    assert.equal(frame.pending.kind, 'idle');
  };
  const evaluate = (source) => {
    const bytes = Buffer.from(source + '\0');
    const p = core._malloc(bytes.length);
    core.HEAPU8.set(bytes, p);
    try {
      assert.equal(core._replay_evaluate(engine.handle, p), 1, core.UTF8ToString(core._replay_error()));
    } finally { core._free(p); }
  };
  const respond = (answer) => {
    const request = frame.pending;
    assert.equal(engine.respond(request.id, request.player, answer), true, JSON.stringify(request));
    return advance();
  };
  const settle = (trace, onCards) => {
    for (let step = 0; step < 40; step++) {
      const request = frame.pending;
      trace.push(structuredClone(request));
      if (request.kind === 'idle') return;
      if (request.kind === 'place') respond([request.choices[0].index]);
      else if (request.kind === 'yesno') respond(1);
      else if (request.kind === 'option') respond(0);
      else if (request.kind === 'position') respond(request.choices[0].value);
      else if (request.kind === 'chain' && request.cancelable) respond(-1);
      else if (request.kind === 'cards') onCards(request);
      else throw Error('Unexpected native request ' + JSON.stringify(request));
    }
    throw Error('Native effect did not return to idle');
  };

  const skyResults = [];
  for (const count of [0, 1]) {
    open([40044918, ...Array(39).fill(26202165)]);
    // Fixed setup only: the original shipped Stratos script handles its
    // actual summon trigger, option, selection, and resolution unchanged.
    evaluate(`Debug.AddCard(40044918,0,0,LOCATION_MZONE,2,POS_FACEUP_ATTACK)
      Debug.AddCard(83968380,1,1,LOCATION_SZONE,0,POS_FACEDOWN_DEFENSE)`);
    const summon = frame.pending.choices.find((choice) => choice.code === 40044918 && choice.action === 0);
    assert.ok(summon, 'Original Sky Stratos normal summon must be offered');
    respond(summon.value);
    const trace = [];
    let selection;
    settle(trace, (request) => {
      assert.equal(request.message, 15);
      assert.equal(request.min, 0);
      assert.equal(request.max, 1);
      assert.equal(request.cancelable, false);
      assert.equal(needsPracticePrompt(request), false, 'All candidates are selectable on the board');
      assert.deepEqual(request.choices.map((choice) => choice.code), [83968380]);
      assert.deepEqual([...encodePracticeAnswer(request, [])], [0], 'Choose none is one count byte');
      assert.equal(encodePracticeAnswer(request, -1), undefined, 'Choose none must not be confused with cancellation');
      selection = structuredClone(request);
      respond(count ? [request.choices[0].index] : []);
    });
    assert.ok(selection, 'Native destruction selection occurred');
    assert.equal(frame.pending.kind, 'idle');
    const trap = frame.cards.find((card) => card.code === 83968380);
    assert.equal(trap?.location, count ? 16 : 8, 'Core must preserve zero selected cards and destroy one selected card');
    skyResults.push({ selectedCount: count, selection, messages: trace.map((request) => request.message), trapLocation: trap.location });
    engine.close();
  }

  const topCodes = [89631139, 46986414, 70781052];
  open([98645731, ...Array(5).fill(26202165), ...topCodes, ...Array(31).fill(26202165)]);
  const beforeTop = frame.cards.filter((card) => card.player === 0 && card.location === 1)
    .sort((a, b) => b.sequence - a.sequence).slice(0, 3).map((card) => card.code);
  assert.deepEqual(beforeTop, topCodes);
  const activation = frame.pending.choices.find((choice) => choice.code === 98645731 && choice.action === 5);
  assert.ok(activation, 'Original Pot of Duality activation must be offered');
  respond(activation.value);
  const trace = [];
  let potSelection;
  let revealEvent;
  settle(trace, (request) => {
    assert.equal(request.message, 15);
    assert.equal(request.min, 1);
    assert.equal(request.max, 1);
    assert.equal(request.cancelable, false);
    assert.equal(needsPracticePrompt(request), true);
    const codes = request.choices.map((choice) => choice.code);
    assert.deepEqual([...codes].sort(), [...topCodes].sort(), 'Select candidates must contain all three revealed card codes');
    assert.ok(codes.every((code) => code > 0), 'No card back or zero code is sent');
    const revealed = events.find((event) => event[0] === 30 && event[2] === 3);
    assert.ok(revealed, 'Native MSG_CONFIRM_DECKTOP must be emitted');
    const bytes = Buffer.from(revealed);
    const revealedCodes = Array.from({ length: 3 }, (_, i) => bytes.readUInt32LE(3 + i * 7) & 0x7fffffff);
    assert.deepEqual(revealedCodes, topCodes, 'Confirmation has all real top-three codes');
    assert.ok(events.indexOf(revealed) < events.findIndex((event) => event[0] === 15), 'Reveal precedes the selection request');
    potSelection = structuredClone(request);
    revealEvent = { raw: revealed, codes: revealedCodes };
    respond([request.choices.find((choice) => choice.code === topCodes[1]).index]);
  });
  assert.ok(potSelection);
  assert.ok(frame.cards.some((card) => card.player === 0 && card.location === 2 && card.code === topCodes[1]));
  assert.ok(frame.cards.some((card) => card.location === 16 && card.code === 98645731));
  assert.ok(topCodes.filter((code) => code !== topCodes[1]).every((code) => frame.cards.some((card) => card.location === 1 && card.code === code)));
  engine.close();
  console.log(JSON.stringify({
    passed: true,
    scripts: { sky: sky.sha256, pot: pot.sha256 },
    sky: skyResults,
    pot: { beforeTop, revealEvent, selection: potSelection, messages: trace.map((request) => request.message), chosen: topCodes[1] },
  }, null, 2));
} finally { await vite.close(); }
