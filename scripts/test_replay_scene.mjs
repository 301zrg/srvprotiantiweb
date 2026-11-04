import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createServer } from "vite";
// The history conversion reads the language settings on import.
globalThis.window = {
  location: new URL("http://localhost/"),
  addEventListener() {},
  navigator: { userAgent: "test" },
};
globalThis.localStorage = {
  getItem: (key) => (key === "language" ? "cn" : null),
  setItem() {},
};
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
  const { eventHistoryEntries } = await server.ssrLoadModule(
    "/src/ui/Shared/DuelHistory/convert.ts",
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
    visible = 0,
    carried = 0;
  // Keyed one-shot effects (the departing card) follow the action id; it is
  // unique within one replay.
  const actionIds = new Set();
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
    actionIds.clear();
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
        steps = sceneSteps(scene, next, { confirmations: true });
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
      for (const step of steps.slice(0, -1)) {
        assert.ok(step.action?.id, "Every displayed action has an id");
        assert.ok(!actionIds.has(step.action.id), "Action ids are unique");
        actionIds.add(step.action.id);
      }
      if (steps.length === 1 && scene.action) {
        // No visible event: the previous action stays, with the same id, so
        // its departing card does not fly again.
        assert.equal(final.action?.id, scene.action.id);
        carried++;
      }
      scene = final;
      batches++;
    }
  }
  assert.ok(carried > 0, "Samples include batches without visible events");
  // The top of the Deck revealed one card at a time (Pot of Duality, Reasoning),
  // ending with its batch so a card does not stay shown.
  {
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const base = {
      names: ["A", "B"], lp: [8000, 8000], turn: 1, phase: 4, turnPlayer: 0,
      step: 0, consumed: 0, total: 1, events: [], cards: [],
    };
    const before = seedScene(base);
    const frame = {
      ...base,
      step: 1,
      events: [
        [30, 1, 2, ...u32(111), 1, 1, 35, ...u32(222), 1, 1, 34],
        [31, 0, 0, 1, ...u32(333), 0, 8, 2],
      ],
    };
    const steps = sceneSteps(before, frame, { confirmations: true });
    assert.deepEqual(
      steps.slice(0, -1).map(({ action }) => [action.kind, action.code, action.to]),
      [
        ["confirm", 111, { player: 1, location: 1, sequence: 35 }],
        ["confirm", 222, { player: 1, location: 1, sequence: 34 }],
        ["confirm", 333, { player: 0, location: 8, sequence: 2 }],
      ],
    );
    assert.equal(steps.at(-1).action.kind, "ready", "The reveal ends with its batch");
    assert.ok(!steps[0].action.brief, "A short reveal keeps the full step");
    const long = sceneSteps(
      before,
      {
        ...frame,
        events: [
          [30, 1, 6, ...Array.from({ length: 6 }, (_, n) => [...u32(100 + n), 1, 1, n]).flat()],
        ],
      },
      { confirmations: true },
    );
    assert.equal(long.length, 7);
    assert.ok(long.slice(0, -1).every(({ action }) => action.brief), "Past 5 cards go quicker");
    assert.deepEqual(
      eventHistoryEntries(frame.events, { turn: 1 }).map(({ kind, code, player }) => [
        kind,
        code,
        player,
      ]),
      [
        ["confirmed", 111, 1],
        ["confirmed", 222, 1],
        ["confirmed", 333, 0],
      ],
      "The log names every revealed card",
    );
    assert.equal(
      sceneSteps(before, frame).length,
      1,
      "The hand test keeps its own prompts for these",
    );
  }
  for (const kind of ["move", "draw", "attack", "chain", "damage", "position", "confirm"])
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
// The history conversion pulls in the app's stores, whose handles keep Node open.
process.exit(0);
