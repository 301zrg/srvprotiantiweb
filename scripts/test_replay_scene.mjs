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
  const { seedScene, sceneSteps, sceneSpot } = await server.ssrLoadModule(
    "/src/ui/Shared/DuelBoard/scene.ts",
  );
  const { boardGeometry, zoneRect } = await server.ssrLoadModule(
    "/src/ui/Shared/DuelBoard/geometry.ts",
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
      // Core fields must match the full query exactly. Only these display-only
      // fields are added by the scene layer; they are checked separately below.
      assert.deepEqual(
        final.cards.map(
          ({
            sceneId,
            targeted,
            targetFlash,
            equipTarget,
            cardTargets,
            ...card
          }) => card,
        ),
        next.cards,
        "Every batch settles to exact full Core query",
      );
      const idAt = (place) =>
        final.cards.find(
          (c) =>
            c.player === place.player &&
            c.location === place.location &&
            c.sequence === place.sequence,
        )?.sceneId;
      const ids = new Set(final.cards.map((c) => c.sceneId));
      for (const card of final.cards) {
        if (card.equipLocation)
          assert.equal(
            card.equipTarget,
            idAt(card.equipLocation),
            "Equip link follows the Core-reported location",
          );
        if (card.targetLocations)
          assert.deepEqual(
            card.cardTargets,
            card.targetLocations.map(idAt).filter(Boolean),
            "Card targets follow the Core-reported locations",
          );
        for (const id of [card.equipTarget, ...(card.cardTargets ?? [])])
          if (id) assert.ok(ids.has(id), "Links only reference live cards");
      }
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
  // Replays share the online board geometry: a slot is mirrored between views
  // and piles never coincide with each other.
  const g = boardGeometry({ wide: false, masterRule: 2, roomy: false });
  const near = zoneRect(g, sceneSpot({ player: 0, location: 4, sequence: 0 }, 0));
  const far = zoneRect(g, sceneSpot({ player: 0, location: 4, sequence: 0 }, 1));
  assert.deepEqual([far.x, far.y], [-near.x, -near.y]);
  assert.notDeepEqual(
    zoneRect(g, sceneSpot({ player: 0, location: 1, sequence: 0 }, 0)),
    zoneRect(g, sceneSpot({ player: 0, location: 16, sequence: 0 }, 0)),
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
