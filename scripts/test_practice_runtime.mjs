import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
assert.ok(
  existsSync("src/practice/engine.ts"),
  "Practice must run a separate interactive Core loop",
);
const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { PracticeEngine } = await vite.ssrLoadModule(
    "/src/practice/engine.ts",
  );
  const { ReplayEngine } = await vite.ssrLoadModule("/src/replay/engine.ts");
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const core = await create({
    wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"),
    printErr: () => {},
  });
  new ReplayEngine(core).install(
    readFileSync("public/replay/706-v1/cards.data"),
    gunzipSync(readFileSync("public/replay/706-v1/scripts.data")),
  );
  const engine = new PracticeEngine(core);
  const deck = (code, n = 40) => ({
    deckName: String(code),
    main: Array(n).fill(code),
    extra: [],
    side: [],
  });
  const config = {
    decks: [deck(26202165), deck(97268402)],
    seed: [10, 20, 30, 40],
    hand: 5,
    noShuffle: false,
    rules: 2,
  };
  let f = engine.open(config);
  const seen = [];
  const advance = () => {
    for (let i = 0; i < 2000; i++) {
      f = engine.next();
      seen.push(f);
      if (f.pending) return f;
    }
    throw Error("No prompt");
  };
  advance();
  assert.equal(
    f.cards.filter((c) => c.player === 0 && c.location === 2).length,
    6,
    "MR2 A draws on first turn",
  );
  assert.equal(
    f.cards.filter((c) => c.player === 1 && c.location === 2).length,
    5,
  );
  assert.ok(
    f.cards.filter((c) => c.player === 0).every((c) => c.code === 26202165),
  );
  assert.ok(
    f.cards.filter((c) => c.player === 1).every((c) => c.code === 97268402),
  );
  assert.equal(f.pending.player, 0);
  assert.equal(f.pending.kind, "idle");
  const initial = f.cards;
  const stale = f.pending;
  engine.open(config);
  advance();
  assert.deepEqual(
    f.cards,
    initial,
    "same seeds and deck snapshot reproduce initial hand",
  );
  assert.equal(
    engine.respond(stale.id, stale.player, -1),
    false,
    "restarted request rejects old response",
  );
  assert.equal(
    engine.respond(f.pending.id, 1 - f.pending.player, -1),
    false,
    "wrong side cannot answer request",
  );
  function pass() {
    const p = f.pending;
    assert.ok(p);
    let value;
    if (p.kind === "idle") value = 7;
    else if (p.kind === "battle") value = 3;
    else if (p.kind === "chain") value = -1;
    else if (p.kind === "cards")
      value = p.choices.slice(0, p.min).map((c) => c.index);
    else throw Error("Unexpected " + p.kind);
    assert.equal(engine.respond(p.id, p.player, value), true);
    advance();
  }
  // Summon with A, select a zone, then B receives Effect Veiler's chain.
  const summon = f.pending.choices.find((c) => c.action === 0);
  assert.ok(summon, "A can normal summon");
  assert.equal(
    engine.respond(f.pending.id, f.pending.player, summon.value),
    true,
  );
  advance();
  if (f.pending.kind === "place") {
    assert.equal(
      engine.respond(f.pending.id, f.pending.player, [
        f.pending.choices[0].index,
      ]),
      true,
    );
    advance();
  }
  assert.equal(f.pending.kind, "chain");
  assert.equal(
    f.pending.player,
    1,
    "Opponent hand-effect choice belongs to B during A turn",
  );
  assert.equal(f.turnPlayer, 0);
  for (
    let i = 0;
    i < 30 && !(f.pending.kind === "idle" && f.pending.player === 1);
    i++
  )
    pass();
  assert.equal(
    f.pending.player,
    1,
    "B gets an actual main-phase action request",
  );
  assert.equal(f.turnPlayer, 1);
  const evaluate = (source) => {
    const bytes = Buffer.from(source + "\0"),
      p = core._malloc(bytes.length);
    core.HEAPU8.set(bytes, p);
    try {
      assert.equal(
        core._replay_evaluate(engine.handle, p),
        1,
        core.UTF8ToString(core._replay_error()),
      );
    } finally {
      core._free(p);
    }
  };
  evaluate("Duel.SetLP(0,0)");
  const before = seen.length;
  pass();
  assert.ok(
    seen.slice(before).some((x) => x.ignoredWins > 0),
    "LP0 win is observed and ignored",
  );
  assert.ok(f.pending, "LP0 must not stop play");
  const lpWins = f.ignoredWins;
  evaluate("Duel.SetLP(0,8000) Duel.Win(1,0x10)");
  for (let i = 0; i < 30 && f.ignoredWins === lpWins; i++) pass();
  assert.ok(
    f.ignoredWins > lpWins,
    "Special victory must be observed and ignored",
  );
  assert.ok(f.pending);
  engine.open({ ...config, decks: [deck(26202165, 5), deck(26202165, 5)] });
  advance();
  for (let i = 0; i < 20 && f.turn < 3; i++) pass();
  assert.ok(f.turn >= 3, "Deckout continues across later turns");
  assert.ok(f.ignoredWins > 0);
  const last = f.pending;
  engine.close();
  assert.equal(
    engine.respond(last.id, last.player, 7),
    false,
    "Exit invalidates pending response",
  );
  console.log(
    JSON.stringify({
      passed: true,
      mr2FirstDraw: true,
      bothDecks: true,
      opponentChainOwner: true,
      restartExact: true,
      staleRejected: true,
      lp0: true,
      specialWin: true,
      deckout: true,
    }),
  );
} finally {
  await vite.close();
}
