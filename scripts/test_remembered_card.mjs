// A face-down card this client has already seen is a memory aid; everything
// else face-down stays hidden.
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { rememberedCode } = await server.ssrLoadModule(
    "/src/variant/rememberedCard.ts",
  );
  const { ygopro } = await server.ssrLoadModule(
    "/src/api/ocgcore/idl/ocgcore.ts",
  );
  const { MZONE, SZONE, GRAVE, DECK, REMOVED } = ygopro.CardZone;
  const { FACEDOWN_DEFENSE, FACEDOWN_ATTACK, FACEDOWN, FACEUP_ATTACK } =
    ygopro.CardPosition;
  const card = (location, code = 98765) => ({ code, location });
  const set = { zone: MZONE, position: FACEDOWN_DEFENSE };

  assert.equal(rememberedCode(card(set), false), 98765, "Book of Moon target");
  assert.equal(
    rememberedCode(card({ zone: MZONE, position: FACEDOWN_ATTACK }), false),
    98765,
  );
  assert.equal(
    rememberedCode(card({ zone: SZONE, position: FACEDOWN }), false),
    98765,
    "Scrap-Iron Scarecrow set again",
  );
  assert.equal(rememberedCode(card(set, 0), false), 0, "Never seen, or shuffled");
  assert.equal(rememberedCode(card(set), true), 0, "One's own set card");
  assert.equal(
    rememberedCode(card({ zone: MZONE, position: FACEUP_ATTACK }), false),
    0,
    "Face-up cards are simply public",
  );
  assert.equal(
    rememberedCode(card({ ...set, is_overlay: true }), false),
    0,
    "Materials have their own display",
  );
  for (const zone of [DECK, GRAVE, REMOVED])
    assert.equal(
      rememberedCode(card({ zone, position: FACEDOWN }), false),
      0,
      "Only the field: a code left on a deck card may be stale after shuffling",
    );
  console.log(
    "Remembered card: flipped-down and confirmed field cards, own cards, unseen cards, face-up, materials and other zones passed.",
  );
} finally {
  await server.close();
}
