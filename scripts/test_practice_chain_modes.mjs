import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { parsePracticeRequest, practiceHintResults } =
    await vite.ssrLoadModule("/src/practice/prompts.ts");
  const { passPracticeChain } = await vite.ssrLoadModule(
    "/src/practice/chain.ts",
  );
  const empty = Uint8Array.from([16, 1, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const request = parsePracticeRequest(empty, 7);
  assert.equal(
    passPracticeChain(request, 0),
    false,
    "All must let the player inspect an empty response window",
  );
  assert.equal(
    passPracticeChain(request, 1),
    true,
    "Ignore passes an empty response window",
  );
  assert.equal(
    passPracticeChain(request, 2),
    true,
    "Smart passes an empty response window",
  );
  assert.equal(
    request.hint0,
    0x04030201,
    "Keep Core timing hints for presentation",
  );
  assert.equal(request.hint1, 0x08070605, "Keep both Core timing hints");
  const hint = (kind, player, value) => [
    2,
    kind,
    player,
    ...new Uint8Array(new Uint32Array([value]).buffer),
  ];
  assert.deepEqual(
    practiceHintResults([
      hint(4, 0, 70),
      hint(6, 1, 32),
      hint(7, 0, 4),
      hint(8, 1, 26202165),
      hint(9, 0, 15),
      hint(11, 1, 0x10002),
      hint(1, 0, 40),
      [2, 9, 0],
      [41, 1],
    ]),
    [
      { player: 0, result: { kind: "option", value: 70 } },
      { player: 1, result: { kind: "race", value: 32 } },
      { player: 0, result: { kind: "attribute", value: 4 } },
      { player: 1, result: { kind: "card", value: 26202165 } },
      { player: 0, result: { kind: "number", value: 15 } },
      { player: 1, result: { kind: "zone", value: 0x10002 } },
    ],
    "Selection hint results retain the requesting side and exact value, excluding timing hints",
  );

  const { PracticeEngine } = await vite.ssrLoadModule(
    "/src/practice/engine.ts",
  );
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const core = await create({
    wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"),
    printErr: () => {},
  });
  const engine = new PracticeEngine(core);
  engine.install(
    readFileSync("public/replay/706-v1/cards.data"),
    gunzipSync(readFileSync("public/replay/706-v1/scripts.data")),
  );
  const deck = {
    deckName: "Empty response fixture",
    main: Array(40).fill(26202165),
    extra: [],
    side: [],
  };
  const config = {
    decks: [deck, deck],
    seed: [1, 2, 3, 4],
    hand: 5,
    noShuffle: true,
    rules: 2,
  };
  const nextRequest = () => {
    for (let i = 0; i < 500; i++) {
      const frame = engine.next();
      if (frame.pending) return frame;
    }
    throw Error("Native Core produced no request");
  };
  engine.open(config);
  assert.equal(
    nextRequest().pending.kind,
    "idle",
    "Default remains Smart for existing Core scripts",
  );
  for (const mode of [0, 1, 2]) {
    engine.setChainMode(mode);
    engine.open(config);
    const frame = nextRequest();
    if (mode === 0) {
      assert.equal(
        frame.pending.kind,
        "chain",
        "All receives the real empty chain request",
      );
      assert.deepEqual(frame.pending.choices, []);
      assert.equal(
        engine.next().pending.id,
        frame.pending.id,
        "Inspecting does not advance the Core",
      );
      assert.equal(
        engine.respond(frame.pending.id, 1 - frame.pending.player, -1),
        false,
        "The other player cannot pass",
      );
      assert.equal(
        engine.respond(frame.pending.id, frame.pending.player, -1),
        true,
      );
      engine.setChainMode(2);
      assert.equal(
        nextRequest().pending.kind,
        "idle",
        "Manual continuation consumes -1 and resumes",
      );
    } else
      assert.equal(
        frame.pending.kind,
        "idle",
        "Smart and Ignore skip real empty requests",
      );
  }
  engine.setChainMode(2);
  engine.open(config);
  const idle = nextRequest();
  const source = Buffer.from(
    "Duel.Hint(HINT_OPSELECTED,0,70) Duel.Hint(HINT_RACE,1,32) Duel.Hint(HINT_ATTRIB,0,4) Duel.Hint(HINT_CODE,1,26202165) Duel.Hint(HINT_NUMBER,0,15) Duel.Hint(HINT_ZONE,1,65538)\0",
  );
  const pointer = core._malloc(source.length);
  core.HEAPU8.set(source, pointer);
  try {
    assert.equal(
      core._replay_evaluate(engine.handle, pointer),
      1,
      core.UTF8ToString(core._replay_error()),
    );
  } finally {
    core._free(pointer);
  }
  assert.equal(engine.respond(idle.pending.id, idle.pending.player, 7), true);
  const nativeResults = [];
  for (let i = 0; i < 100 && nativeResults.length < 6; i++)
    nativeResults.push(...practiceHintResults(engine.next().events));
  assert.deepEqual(
    nativeResults.map(({ result }) => [result.kind, result.value]),
    [
      ["option", 70],
      ["race", 32],
      ["attribute", 4],
      ["card", 26202165],
      ["number", 15],
      ["zone", 65538],
    ],
    "Real Core public result hints reach the shared presentation result format",
  );
  engine.close();
  console.log(
    "PASS native Core empty response windows: All stops, Smart/Ignore pass, manual continuation and timing hints",
  );
} finally {
  await vite.close();
}
