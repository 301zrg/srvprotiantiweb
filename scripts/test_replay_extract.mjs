import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { extractionFixture } from "./replay_extract_fixture.mjs";

// A missing extractor, sorting/deduplication, empty success, duel creation, or
// overwrite on a colliding name must each fail this consumer-facing contract.
assert.ok(
  existsSync("src/replay/extract.ts"),
  "Replay deck extraction must exist",
);
const server = await createServer({
  server: { middlewareMode: true, watch: null, hmr: false },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { extractReplayDecks, saveExtractedDeck, UnsupportedReplayExtraction } =
    await server.ssrLoadModule("/src/replay/extract.ts");
  const { deckStore } = await server.ssrLoadModule("/src/stores/deckStore.ts");
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const core = await create({
    wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"),
    printErr() {},
  });
  core._replay_create = () => assert.fail("Extraction must not create a duel");
  core._replay_add_cards = () =>
    assert.fail("Extraction must not install cards");
  core._replay_add_script = () =>
    assert.fail("Extraction must not install Lua");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    assert.fail("Extraction using a loaded runtime must not fetch resources");
  try {
    const bytes = extractionFixture(),
      before = Buffer.from(bytes);
    const decks = await extractReplayDecks(bytes, {
      title: "Ordered",
      filename: "ordered.yrp",
      loadRuntime: () =>
        assert.fail("Uncompressed extraction needs no runtime"),
    });
    assert.deepEqual(decks, [
      {
        deckName: "Ordered - Alpha",
        playerName: "Alpha",
        main: [999999999, 123, 999999999],
        extra: [456, 321],
        side: [],
      },
      {
        deckName: "Ordered - Beta",
        playerName: "Beta",
        main: [42],
        extra: [77],
        side: [],
      },
    ]);
    assert.deepEqual(
      bytes,
      before,
      "Extraction must preserve original replay bytes",
    );
    const expectedFirst = {
      "native-deckout": [
        46986414, 46986414, 46986414, 89631139, 89631139, 46986414, 46986414,
        89631139, 89631139, 46986414, 46986414, 89631139, 89631139, 46986414,
        46986414, 89631139, 89631139, 46986414, 46986414, 46986414, 89631139,
        89631139, 46986414, 89631139, 46986414, 89631139, 89631139, 46986414,
        89631139, 89631139, 89631139, 46986414, 46986414, 89631139, 46986414,
        46986414, 89631139, 89631139, 46986414, 89631139,
      ],
      "native-monk-flip": Array(40).fill(21502796),
      "native-confirm-search": Array(40).fill(46986414),
    };
    for (const name of [
      "native-deckout",
      "native-battle-equip",
      "native-monk-flip",
      "native-confirm-search",
    ]) {
      const native = readFileSync(`tests/fixtures/replay/${name}.yrp`),
        copy = Buffer.from(native);
      const actual = await extractReplayDecks(native, {
        title: name,
        loadRuntime: async () => core,
      });
      const names = ["ReplayFixtureB", "ReplayFixtureA"];
      assert.deepEqual(
        actual.map((d) => [
          d.playerName,
          d.main.length,
          d.extra.length,
          d.side.length,
        ]),
        names.map((n) => [n, 40, 0, 0]),
      );
      if (expectedFirst[name])
        assert.deepEqual(actual[0].main, expectedFirst[name]);
      else
        assert.deepEqual(
          actual[0].main.slice(0, 6),
          [69247929, 40619825, 40619825, 69140098, 40619825, 40619825],
        );
      assert.deepEqual(native, copy);
    }
    for (const flags of [2 | 16, 8 | 16, 0]) {
      const unsupported = Buffer.from(bytes);
      unsupported.writeUInt32LE(flags, 8);
      await assert.rejects(
        extractReplayDecks(unsupported),
        UnsupportedReplayExtraction,
      );
    }
    const old = Buffer.from(bytes);
    old.writeUInt32LE(0x31707279, 0);
    old.writeUInt32LE(old.length - 32, 16);
    await assert.rejects(extractReplayDecks(old), UnsupportedReplayExtraction);
    const newer = Buffer.from(bytes);
    newer.writeUInt32LE(0x9999, 4);
    await assert.rejects(
      extractReplayDecks(newer),
      UnsupportedReplayExtraction,
    );
    for (const invalid of [
      bytes.subarray(0, 60),
      bytes.subarray(0, bytes.length - 1),
      Buffer.alloc(100),
    ])
      await assert.rejects(extractReplayDecks(invalid));
    await assert.rejects(
      extractReplayDecks(extractionFixture([[], [456], [42], [77]])),
      /长度/,
    );
    await assert.rejects(
      extractReplayDecks(Buffer.from([1, 1, 0, 0, 0, 42]), {
        filename: "old.yrp3d",
      }),
      UnsupportedReplayExtraction,
    );
    const corrupt = Buffer.from(
      readFileSync("tests/fixtures/replay/native-deckout.yrp"),
    );
    corrupt.fill(0, 80);
    await assert.rejects(
      extractReplayDecks(corrupt, { loadRuntime: async () => core }),
      /LZMA/,
    );
    deckStore.decks = [];
    await deckStore.add({
      deckName: "Ordered - Alpha",
      main: [555],
      extra: [],
      side: [666],
    });
    const [saved, again] = await Promise.all([
      saveExtractedDeck(decks[0], deckStore),
      saveExtractedDeck(decks[0], deckStore),
    ]);
    assert.equal(saved.deckName, "Ordered - Alpha (2)");
    assert.equal(again.deckName, "Ordered - Alpha (3)");
    assert.deepEqual(deckStore.get("Ordered - Alpha"), {
      deckName: "Ordered - Alpha",
      main: [555],
      extra: [],
      side: [666],
    });
    assert.deepEqual(
      deckStore.decks.map((d) => d.main),
      [[555], [999999999, 123, 999999999], [999999999, 123, 999999999]],
    );
    // A stale tab need not know about an existing IDB name to avoid overwriting.
    deckStore.decks = [];
    assert.equal(
      (await saveExtractedDeck(decks[0], deckStore)).deckName,
      "Ordered - Alpha (4)",
    );
    await assert.rejects(
      saveExtractedDeck(decks[0], {
        decks: [],
        persistenceAvailable: false,
        async add() {
          return false;
        },
      }),
      /保存/,
    );
    await deckStore.reset();
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "Replay extraction PASS: 4 native compressed fixtures, ordered unknown/duplicate IDs, unsupported/corrupt input, no duel/cards/Lua/fetch, unique persistent saves",
  );
} finally {
  await server.close();
}
