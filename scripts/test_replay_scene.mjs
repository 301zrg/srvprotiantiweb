import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { seedScene, sceneSteps, scenePoint } = await server.ssrLoadModule(
    "/src/ui/Replay/scene.ts",
  );
  const { ReplayEngine } = await server.ssrLoadModule("/src/replay/engine.ts");
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const core = await create({
    wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"),
    printErr: () => {},
  });
  const engine = new ReplayEngine(core);
  engine.install(
    readFileSync("public/replay/706-v1/cards.data"),
    gunzipSync(readFileSync("public/replay/706-v1/scripts.data")),
  );
  const kinds = new Set();
  let batches = 0,
    visible = 0;
  const fixtures = [
    "native-deckout",
    "native-battle-equip",
    "native-monk-flip",
    "native-confirm-search",
  ].map((name) => `tests/fixtures/replay/${name}.yrp`);
  if (process.env.SRVPRO_REPLAY_FIXTURE)
    fixtures.push(process.env.SRVPRO_REPLAY_FIXTURE);
  for (const fixture of fixtures) {
    let scene = seedScene(engine.open(readFileSync(fixture)));
    assert.deepEqual(
      seedScene(scene, {
        ...scene,
        chains: [
          { player: 0, location: 4, sequence: 0, code: 46986414, index: 1 },
        ],
      }).chains,
      [],
      "A fresh seek/restart must clear old chain markers",
    );
    while (!scene.end) {
      const next = engine.next(),
        original = JSON.stringify(scene),
        steps = sceneSteps(scene, next);
      assert.equal(
        JSON.stringify(scene),
        original,
        "Presentation must not mutate an already displayed frame",
      );
      assert.ok(steps.length <= 129, "Only one bounded Core batch is queued");
      const final = steps.at(-1);
      assert.deepEqual(
        final.cards.map(({ sceneId, ...card }) => card),
        next.cards,
        "Every batch settles to exact full Core query",
      );
      assert.deepEqual(final.lp, next.lp);
      assert.equal(
        new Set(final.cards.map((c) => c.sceneId)).size,
        final.cards.length,
        "Card identity must be unique",
      );
      for (const step of steps) {
        if (step.action) kinds.add(step.action.kind);
        visible++;
      }
      scene = final;
      batches++;
    }
  }
  for (const kind of ["move", "draw", "attack", "chain", "damage", "position"])
    assert.ok(kinds.has(kind), `Native samples must exercise ${kind}`);
  assert.deepEqual(scenePoint({ player: 0, location: 4, sequence: 0 }, 0), {
    x: 215,
    y: 535,
  });
  assert.deepEqual(scenePoint({ player: 0, location: 4, sequence: 0 }, 1), {
    x: 785,
    y: 385,
  });
  assert.notDeepEqual(
    scenePoint({ player: 0, location: 1, sequence: 0 }, 0),
    scenePoint({ player: 0, location: 16, sequence: 0 }, 0),
  );
  console.log(
    JSON.stringify({
      passed: true,
      batches,
      visible,
      actions: [...kinds],
      finalQueriesExact: true,
      previousFramesImmutable: true,
    }),
  );
  engine.close();
} finally {
  await server.close();
}
