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
  const { PracticeEngine } = await vite.ssrLoadModule(
    "/src/practice/engine.ts",
  );
  const { encodePracticeAnswer } = await vite.ssrLoadModule(
    "/src/practice/prompts.ts",
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
    deckName: "Native prompt fixture",
    main: Array(40).fill(26202165),
    extra: [],
    side: [],
  };
  let frame = engine.open({
    decks: [deck, deck],
    seed: [1, 2, 3, 4],
    rules: 2,
    hand: 5,
    noShuffle: true,
  });
  const advance = () => {
    for (let i = 0; i < 2000; i++) {
      frame = engine.next();
      if (frame.pending) return;
    }
    throw Error("No request");
  };
  advance();
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
  // Fixed test-only Lua enters the same coroutine scheduler as card scripts.
  // The shipped worker has no evaluate request or Lua input interface.
  evaluate(`local c1=Debug.AddCard(26202165,1,1,LOCATION_MZONE,0,POS_FACEUP_ATTACK)
 local c2=Debug.AddCard(26202165,1,1,LOCATION_MZONE,1,POS_FACEUP_ATTACK)
 local e=Effect.CreateEffect(Duel.GetFieldGroup(0,LOCATION_HAND,0):GetFirst())
 e:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
 e:SetCode(EVENT_PHASE+PHASE_END)
 e:SetCountLimit(1)
 e:SetOperation(function()
   local xyz=Debug.AddCard(10002346,0,0,LOCATION_MZONE,2,POS_FACEUP_DEFENSE)
   local mat1=Debug.AddCard(26202165,0,0,LOCATION_GRAVE,0,POS_FACEUP_ATTACK)
   local mat2=Debug.AddCard(46986414,0,0,LOCATION_GRAVE,0,POS_FACEUP_ATTACK)
   Duel.Overlay(xyz,Group.FromCards(mat1,mat2))
   Duel.Destroy(xyz,REASON_EFFECT)
   assert(xyz:IsLocation(LOCATION_MZONE) and xyz:GetOverlayCount()==1)
   local g=Duel.GetFieldGroup(0,LOCATION_HAND,0)
   local c=g:GetFirst()
   assert(Duel.SelectEffectYesNo(1,c))
   assert(Duel.SelectYesNo(1,30))
   assert(Duel.SelectOption(1,40,50)==0)
   assert(g:Select(1,1,2,nil):GetCount()==1)
   assert(g:SelectUnselect(nil,1,false,false,1,2))
   assert(g:SelectWithSumEqual(1,Card.GetLevel,6,2,2):GetCount()==2)
   assert(g:SelectWithSumGreater(1,Card.GetLevel,4):GetCount()==2)
   assert(Duel.SelectPosition(1,c,POS_FACEUP_ATTACK+POS_FACEUP_DEFENSE)==POS_FACEUP_ATTACK)
   assert(Duel.AnnounceRace(1,1,RACE_WARRIOR+RACE_SPELLCASTER)==RACE_WARRIOR)
   assert(Duel.AnnounceAttribute(1,1,ATTRIBUTE_EARTH+ATTRIBUTE_LIGHT)==ATTRIBUTE_EARTH)
   assert(Duel.AnnounceNumber(1,2,5)==2)
   assert(Duel.AnnounceCard(1)==26202165)
   assert(Duel.RockPaperScissors(false)==0)
   Duel.SelectDisableField(1,1,LOCATION_MZONE,0,0)
   Debug.AddCard(70781052,0,0,LOCATION_DECK,0,POS_FACEDOWN_DEFENSE)
   Debug.AddCard(46986414,0,0,LOCATION_DECK,0,POS_FACEDOWN_DEFENSE)
   Debug.AddCard(89631139,0,0,LOCATION_DECK,0,POS_FACEDOWN_DEFENSE)
   Duel.SortDecktop(1,0,3)
   assert(Duel.SelectTribute(1,Duel.GetFieldGroup(1,LOCATION_HAND,0):GetFirst(),1,1):GetCount()==1)
   Debug.PreAddCounter(c1,0x1234,3)
   Debug.PreAddCounter(c2,0x1234,3)
   assert(Duel.RemoveCounter(1,1,0,0x1234,2,REASON_EFFECT))
   _practice_prompt_done=true
 end)
 Duel.RegisterEffect(e,0)`);
  const seen = [];
  let sortedTop;
  assert.equal(engine.respond(frame.pending.id, frame.pending.player, 7), true);
  advance();
  for (let step = 0; step < 100; step++) {
    const p = frame.pending;
    if (p.kind === "idle") break;
    seen.push(p.message);
    if (seen.length <= 2) {
      assert.equal(p.player,0,"Gachi's replacement belongs to A");
      if (p.message===12) {assert.equal(p.code,10002346);assert.equal(p.description,96);assert.equal(p.location,4);}
      else {assert.equal(p.message,15);assert.deepEqual(p.choices.map(c=>c.location),[132,132]);assert.deepEqual(p.choices.map(c=>c.value),[0,1]);}
    } else if (p.message !== 132) assert.equal(p.player, 1, "Scripted choices belong to B during A end phase");
    let answer;
    if (p.message === 132) answer = p.player === 0 ? 2 : 1;
    else if (p.kind === "yesno") answer = 1;
    else if (p.kind === "option") answer = p.choices[0].value;
    else if (
      p.kind === "cards" ||
      p.kind === "unselect" ||
      p.kind === "tribute"
    )
      answer = [0];
    else if (p.kind === "counter")
      answer = p.choices.map((_, i) => (i === 0 ? 2 : 0));
    else if (p.kind === "sum") {
      assert.equal(
        encodePracticeAnswer(p, [0]),
        undefined,
        "Insufficient level total must not be submitted",
      );
      answer = [0, 1];
    } else if (p.kind === "position") answer = 1;
    else if (p.kind === "bits") answer = [0];
    else if (p.kind === "announce") answer = 26202165;
    else if (p.kind === "place") answer = [p.choices[0].index];
    else if (p.kind === "sort") {
      assert.deepEqual(
        p.choices.map((choice) => choice.code),
        [89631139, 46986414, 70781052],
      );
      // A three-cycle distinguishes new-order indices from old-index ranks;
      // reverse order would be its own inverse and could hide this defect.
      answer = [2, 0, 1];
      sortedTop = answer.map((index) => p.choices[index].code);
    } else throw Error("Unexpected " + p.kind);
    assert.equal(
      engine.respond(p.id, p.player, answer),
      true,
      JSON.stringify(p),
    );
    advance();
    if (p.kind === "sort") {
      assert.deepEqual(
        frame.cards
          .filter((card) => card.player === 0 && card.location === 1)
          .sort((a, b) => b.sequence - a.sequence)
          .slice(0, 3)
          .map((card) => card.code),
        sortedTop,
        "The real Core deck top must follow the user's clicked card order",
      );
    }
  }
  evaluate("assert(_practice_prompt_done==true)");
  assert.deepEqual(
    seen,
    [12, 15, 12, 13, 14, 15, 26, 23, 23, 19, 140, 141, 143, 142, 132, 132, 24, 25, 20, 22],
  );
  engine.close();
  console.log(
    JSON.stringify({
      passed: true,
      nativePromptSequence: seen,
      nativeSortTop: sortedTop,
    }),
  );
} finally {
  await vite.close();
}
