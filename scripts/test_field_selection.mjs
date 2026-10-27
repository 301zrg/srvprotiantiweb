import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});

try {
  const {
    fieldPosition,
    fieldPositionLabel,
    fieldSelectionMessages,
    fieldSelectionRows,
  } = await vite.ssrLoadModule("/src/variant/fieldSelection.ts");

  // A wrong perspective reverses the opponent's left and right targets.
  const positions = [
    [{ player: 0, location: 4, sequence: 0 }, 0, [0, 5, 1002, 1]],
    [{ player: 0, location: 4, sequence: 4 }, 0, [4, 5, 1002, 5]],
    [{ player: 1, location: 4, sequence: 0 }, 0, [4, 5, 1002, 5]],
    [{ player: 1, location: 8, sequence: 4 }, 0, [0, 5, 1003, 1]],
    [{ player: 0, location: 8, sequence: 0 }, 1, [4, 5, 1003, 5]],
    [{ player: 1, location: 4, sequence: 0 }, 1, [0, 5, 1002, 1]],
    [{ player: 1, location: 8, sequence: 5 }, 0, [0, 1, 1008, undefined]],
  ];
  for (const [spot, view, expected] of positions) {
    const position = fieldPosition(spot, view);
    assert.ok(position, "A standard MR2 field address has a position");
    assert.deepEqual(
      [position.column, position.columns, position.systemId, position.slot],
      expected,
    );
  }
  assert.equal(
    fieldPosition({ player: 1, location: 4, sequence: 2 }).column,
    2,
    "The default view is player 0",
  );
  for (const spot of [
    { player: 0, location: 132, sequence: 0 },
    { player: 0, location: 128, sequence: 0 },
    { player: 0, location: 2, sequence: 0 },
    { player: 0, location: 4, sequence: 5 },
    { player: 0, location: 8, sequence: 6 },
    { player: 0, location: 8, sequence: -1 },
    { player: 0, location: 4, sequence: 1.5 },
    { player: 2, location: 4, sequence: 0 },
  ]) {
    assert.equal(
      fieldPosition(spot),
      undefined,
      "Only real supported field slots enter the grid",
    );
  }

  // Visual sorting must never renumber the server/Core's response candidates.
  const options = Object.freeze([
    Object.freeze({ index: 17, player: 0, location: 4, sequence: 4 }),
    Object.freeze({ index: 6, player: 0, location: 4, sequence: 0 }),
    Object.freeze({ index: 23, player: 0, location: 4, sequence: 2 }),
    Object.freeze({ index: 19, player: 1, location: 4, sequence: 0 }),
    Object.freeze({ index: 4, player: 1, location: 8, sequence: 4 }),
    Object.freeze({ index: 31, player: 0, location: 8, sequence: 1 }),
    Object.freeze({ index: 9, player: 0, location: 4, sequence: 2 }),
    Object.freeze({ index: 44, player: 0, location: 132, sequence: 2 }),
    Object.freeze({ index: 55 }),
  ]);
  const address = (option) =>
    option.player === undefined ? undefined : option;
  const grouped = fieldSelectionRows(options, address);
  assert.deepEqual(
    grouped.rows.map(({ player, location }) => [player, location]),
    [
      [1, 8],
      [1, 4],
      [0, 4],
      [0, 8],
    ],
    "Rows follow the visible opponent back/front and own front/back layout",
  );
  const monster = grouped.rows[2];
  assert.deepEqual(
    monster.slots.map((slot) => slot.column),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    monster.slots.map((slot) => slot.options.map((option) => option.index)),
    [[6], [], [23, 9], [], [17]],
    "Sparse targets keep their empty columns; multiple options share one slot",
  );
  assert.strictEqual(monster.slots[0].options[0], options[1]);
  assert.strictEqual(monster.slots[2].options[0], options[2]);
  assert.strictEqual(monster.slots[2].options[1], options[6]);
  assert.deepEqual(
    grouped.fallback,
    [options[7], options[8]],
    "Unsupported and absent field addresses retain ordinary list order",
  );
  assert.deepEqual(
    options.map((option) => option.index),
    [17, 6, 23, 19, 4, 31, 9, 44, 55],
  );
  assert.deepEqual(
    fieldSelectionRows(options, address, 1).rows.map(({ player, location }) => [
      player,
      location,
    ]),
    [
      [0, 8],
      [0, 4],
      [1, 4],
      [1, 8],
    ],
    "Changing view swaps physical sides without changing candidate ownership",
  );
  const field = fieldSelectionRows(
    [
      { player: 0, location: 8, sequence: 5 },
      { player: 0, location: 8, sequence: 0 },
    ],
    (option) => option,
  );
  assert.equal(
    field.rows.length,
    2,
    "A field spell never shares the five-column back row",
  );
  assert.deepEqual(
    field.rows.map((row) => [row.systemId, row.slots.length]),
    [
      [1003, 5],
      [1008, 1],
    ],
  );

  const system = (id) =>
    ({ 1002: "Monster Zone", 1003: "Spell/Trap Zone", 1008: "Field Zone" })[id];
  assert.equal(
    fieldPositionLabel(
      { player: 1, location: 4, sequence: 0 },
      0,
      "en",
      system,
    ),
    "Opponent · Monster Zone · Slot 5 from the left",
  );
  assert.equal(
    fieldPositionLabel(
      { player: 0, location: 8, sequence: 5 },
      0,
      "en",
      system,
      (player) => ["A", "B"][player],
    ),
    "A · Field Zone",
    "A field spell has its own region and no misleading numbered slot",
  );
  assert.equal(
    fieldPositionLabel(
      { player: 0, location: 132, sequence: 0 },
      0,
      "en",
      system,
    ),
    "",
  );
  for (const [language, expected] of [
    ["cn", "从左第 3 格"],
    ["en", "Slot 3 from the left"],
    ["ja", "左から3番目"],
    ["ko", "왼쪽에서 3번째 칸"],
    ["unknown", "Slot 3 from the left"],
  ]) {
    assert.equal(fieldSelectionMessages(language).slot(3), expected);
  }
  console.log(
    "PASS field selection perspective, bilateral rows, sparse slots, fallback and original response identities",
  );
} finally {
  await vite.close();
}
