import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import assert from "node:assert/strict";
const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
mkdirSync(".audit-tmp", { recursive: true });
try {
  const { PracticeEngine } = await vite.ssrLoadModule(
    "/src/practice/engine.ts",
  );
  const create = (
    await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))
  ).default;
  const core = await create({
    wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"),
    printErr: console.error,
  });
  const engine = new PracticeEngine(core);
  engine.install(
    readFileSync("public/replay/706-v1/cards.data"),
    gunzipSync(readFileSync("public/replay/706-v1/scripts.data")),
  );
  const deck = {
    deckName: "public fixture",
    main: Array(40).fill(89631139),
    extra: [],
    side: [],
  };
  engine.open({
    decks: [deck, deck],
    seed: [1, 2, 3, 4],
    hand: 0,
    rules: 2,
    noShuffle: true,
  });
  const evaluate = (source) => {
    const bytes = Buffer.from(source + "\0"),
      p = core._malloc(bytes.length);
    core.HEAPU8.set(bytes, p);
    try {
      if (core._replay_evaluate(engine.handle, p) !== 1)
        throw new Error(core.UTF8ToString(core._replay_error()));
    } finally {
      core._free(p);
    }
  };
  evaluate(
    "auditMonster=Debug.AddCard(89631139,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)",
  );
  const query = () => {
    const p = core._malloc(131072);
    try {
      const n = core._query_field_card(engine.handle, 0, 4, 0xfff, p, 0);
      const bytes = core.HEAPU8.slice(p, p + n),
        v = new DataView(bytes.buffer);
      const size = v.getUint32(0, true),
        flags = v.getUint32(4, true),
        fields = {};
      let offset = 8;
      for (let bit = 1; bit <= 0x800; bit *= 2)
        if (flags & bit) {
          fields["0x" + bit.toString(16)] = v.getInt32(offset, true);
          offset += 4;
        }
      return { size, flags, fields };
    } finally {
      core._free(p);
    }
  };
  const before = query();
  evaluate(`
  for _,v in ipairs({{EFFECT_CHANGE_CODE,46986414},{EFFECT_CHANGE_LEVEL,4},{EFFECT_CHANGE_RACE,RACE_SPELLCASTER},{EFFECT_CHANGE_ATTRIBUTE,ATTRIBUTE_DARK},{EFFECT_CHANGE_TYPE,TYPE_MONSTER+TYPE_EFFECT},{EFFECT_SET_BASE_ATTACK,1800},{EFFECT_UPDATE_ATTACK,700}}) do
   local e=Effect.CreateEffect(auditMonster);e:SetType(EFFECT_TYPE_SINGLE);e:SetCode(v[1]);e:SetValue(v[2]);auditMonster:RegisterEffect(e)
  end
 `);
  const after = query(),
    frame = engine.frame([]),
    monster = frame.cards.find((c) => c.location === 4 && c.sequence === 0);
  assert.equal(monster.code, 89631139);
  assert.equal(monster.currentCode, 46986414);
  assert.equal(monster.type, 33);
  assert.equal(monster.level, 4);
  assert.equal(monster.attribute, 32);
  assert.equal(monster.race, 2);
  assert.equal(monster.attack, 2500);
  assert.equal(monster.baseAttack, 1800);
  assert.equal(monster.defense, 2500);
  assert.equal(monster.baseDefense, 2500);
  evaluate(
    "auditGemini=Debug.AddCard(69884162,0,0,LOCATION_MZONE,1,POS_FACEUP_ATTACK)",
  );
  const geminiBefore = engine
    .frame([])
    .cards.find((c) => c.location === 4 && c.sequence === 1);
  evaluate("auditGemini:EnableDualState()");
  const geminiAfter = engine
    .frame([])
    .cards.find((c) => c.location === 4 && c.sequence === 1);
  assert.equal(
    geminiBefore.type & 32,
    0,
    "Gemini begins as a normal monster on the field",
  );
  assert.equal(
    geminiAfter.type & 32,
    32,
    "Gemini summon exposes the Core effect-monster type",
  );
  const report = { before, after, monster, geminiBefore, geminiAfter };
  writeFileSync(
    ".audit-tmp/round13-identity-audit.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS locked Core current/printed identity, base/current stats and Gemini state",
  );
  engine.close();
} finally {
  await vite.close();
}
