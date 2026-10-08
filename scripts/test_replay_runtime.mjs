import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createServer } from "vite";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { ReplayEngine } = await server.ssrLoadModule("/src/replay/engine.ts");
  const { inspectReplay, parseReplayBody } = await server.ssrLoadModule(
    "/src/replay/format.ts",
  );
  const profile = JSON.parse(
    readFileSync("public/replay/706-v1/profile.json", "utf8"),
  );
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const wasm = readFileSync("public/replay/706-v1/ocgcore.wasm");
  const cards = readFileSync("public/replay/706-v1/cards.data"),
    scripts = gunzipSync(readFileSync("public/replay/706-v1/scripts.data"));
  const core = await create({ wasmBinary: wasm, printErr: () => {} }),
    engine = new ReplayEngine(core);
  engine.install(cards, scripts);
  const fixture = process.argv[2] || "native-deckout";
  const original = new Uint8Array(
    readFileSync(`tests/fixtures/replay/${fixture}.yrp`),
  );
  const expected = JSON.parse(
    readFileSync(`tests/fixtures/replay/${fixture}.json`, "utf8"),
  );
  assert.equal(inspectReplay(original).playable, true);
  const collect = () => {
    const frames = [engine.open(original)],
      trace = [],
      draws = new Map();
    while (!frames.at(-1).end) {
      assert.ok(frames.length < 5000);
      const frame = engine.next();
      frames.push(frame);
      for (const e of frame.events) {
        if (
          [40, 41, 5, 91, 92, 100, 60, 70].includes(e[0]) ||
          (fixture.includes("confirm") && e[0] === 31)
        )
          trace.push({ code: e[0], data: e.slice(1) });
        if (e[0] === 90) {
          const v = new DataView(new Uint8Array(e).buffer);
          const ids = Array.from(
            { length: e[2] },
            (_, i) => v.getUint32(3 + i * 4, true) & 0x7fffffff,
          );
          draws.set(`${e[1]}:${ids.join(",")}`, {
            code: 90,
            player: e[1],
            cards: ids,
          });
        }
      }
    }
    return { frames, trace, draws: Array.from(draws.values()) };
  };
  const first = collect();
  assert.equal(first.frames.at(-1).end, "complete");
  assert.equal(first.frames.at(-1).consumed, first.frames.at(-1).total);
  assert.deepEqual(
    first.trace,
    expected.trace.filter((e) => e.code !== 90),
    "Native turn/phase/winner checkpoints",
  );
  assert.deepEqual(
    first.draws.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
    expected.trace
      .filter((e) => e.code === 90)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    "Native seed/shuffle/draw checkpoints",
  );
  const second = collect();
  const fingerprint = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(
    fingerprint(second.frames),
    fingerprint(first.frames),
    "Destroy/recreate must reproduce every complete queried field",
  );
  if (fixture.includes("confirm")) {
    const confirmations = first.frames.flatMap((frame, i) =>
      frame.events.some((e) => e[0] === 31) ? [i] : [],
    );
    assert.ok(
      confirmations.length > 0,
      "Native search must reveal the selected card",
    );
    for (const i of confirmations)
      assert.equal(
        first.frames[i + 1].consumed,
        first.frames[i].consumed,
        "A confirmation display must not consume the next recorded selection",
      );
  }
  if (fixture.includes("battle")) {
    assert.ok(
      first.frames.some((f) =>
        f.cards.some((c) => c.code === 69247929 && c.attack > 2000),
      ),
      "Actual equipped ATK must be queried",
    );
    assert.ok(
      first.frames.some((f) => f.lp.some((n) => n < 8000)),
      "Battle damage must change actual LP",
    );
  }
  const evaluate = (source) => {
    const bytes = Buffer.from(source + "\0");
    const p = core._malloc(bytes.length);
    core.HEAPU8.set(bytes, p);
    try {
      const ok = core._replay_evaluate(engine.handle, p);
      assert.equal(ok, 1, core.UTF8ToString(core._replay_error()));
    } finally {
      core._free(p);
    }
  };
  engine.open(original);
  evaluate(
    readFileSync("tests/fixtures/replay/special-boundaries.lua", "utf8"),
  );
  let xyzCode = 0;
  for (let p = 0; p < cards.length; p += 80)
    if (cards.readUInt32LE(p + 40) & 0x800000) {
      xyzCode = cards.readUInt32LE(p);
      break;
    }
  assert.ok(xyzCode, "Fixed rules table must include an Xyz query fixture");
  engine.open(original);
  evaluate(`local xyz=Debug.AddCard(${xyzCode},0,0,LOCATION_MZONE,0,POS_FACEUP_DEFENSE)
    Debug.AddCard(69247929,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)
    Debug.AddCard(69140098,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)
    Debug.PreAddCounter(xyz,0x1234,3)`);
  const queried = engine
    .frame([])
    .cards.find((c) => c.code === xyzCode && c.location === 4);
  assert.ok(queried);
  assert.deepEqual(
    queried.overlay.sort((a, b) => a - b),
    [69140098, 69247929],
  );
  assert.ok(
    queried.counters.some((n) => (n & 65535) === 0x1234 && n >>> 16 === 3),
    "Native query must preserve counter type and amount",
  );
  if (fixture.includes("monk")) {
    assert.ok(
      first.trace.some(
        (e) =>
          e.code === 70 &&
          new DataView(new Uint8Array(e.data).buffer).getUint32(0, true) ===
            21502796,
      ),
      "Monk must trigger the returned Ryko flip effect",
    );
    engine.open(original);
    evaluate("Card.GetFlipEffect=nil");
    let differs = false;
    try {
      const broken = [];
      for (let i = 0; i < 5000; i++) {
        const f = engine.next();
        broken.push(f);
        if (f.end) break;
      }
      differs = fingerprint(broken) !== fingerprint(first.frames.slice(1));
    } catch {
      differs = true;
    }
    assert.equal(
      differs,
      true,
      "Removing the installed flip hook must change this same native replay",
    );
  }
  assert.throws(() => inspectReplay(new Uint8Array(31)));
  const bad = original.slice();
  new DataView(bad.buffer).setUint32(16, 0xffffffff, true);
  assert.throws(() => inspectReplay(bad));
  const badDict = original.slice();
  new DataView(badDict.buffer).setUint32(25, 0xffffffff, true);
  assert.throws(() => inspectReplay(badDict));
  assert.throws(() => parseReplayBody(new Uint8Array(95)));
  const truncated = original.slice(0, -1);
  assert.throws(() => engine.open(truncated));
  const appended = new Uint8Array(original.length + 1);
  appended.set(original);
  assert.throws(() => engine.open(appended));
  const future = original.slice();
  new DataView(future.buffer).setUint32(4, 0x9999, true);
  assert.equal(inspectReplay(future).playable, false);
  engine.close();
  console.log(
    JSON.stringify({
      passed: true,
      profile: profile.revision,
      frames: first.frames.length,
      turns: first.frames.at(-1).turn,
      responses: first.frames.at(-1).total,
      nativeCheckpoints: expected.trace.length,
      restartExact: true,
      specialBoundaries: true,
      monkFaultInjection: fixture.includes("monk"),
    }),
  );
} finally {
  await server.close();
}
