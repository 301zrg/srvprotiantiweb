import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createServer} from 'vite';
const vite=await createServer({server:{middlewareMode:true,watch:null},optimizeDeps:{disabled:true},logLevel:'error'});
try {
 const {parsePracticeRequest}=await vite.ssrLoadModule('/src/practice/prompts.ts');
 const {passPracticeChain}=await vite.ssrLoadModule('/src/practice/chain.ts');
 for(const player of [0,1]) for(const special of [0,1]) for(const forced of [0,1]) {
   const bytes=new Uint8Array(26);bytes.set([16,player,1,special]);bytes[13]=forced;new DataView(bytes.buffer).setUint32(14,97268402,true);bytes.set([player,2,0,1],18);
   const p=parsePracticeRequest(bytes,1);assert.equal(p.specialCount,special);assert.equal(p.cancelable,!forced);
   assert.equal(passPracticeChain(p,0),false,'All preserves every available optional choice');
   assert.equal(passPracticeChain(p,1),!forced,'Ignore still preserves mandatory effects');
   assert.equal(passPracticeChain(p,2),!forced&&!special,'Smart uses native special-count for both players');
 }
 const {PracticeEngine}=await vite.ssrLoadModule('/src/practice/engine.ts');
 const {advancePracticeScene}=await vite.ssrLoadModule('/src/ui/Practice/presentation.ts');
 const create=(await import(pathToFileURL(resolve('public/replay/706-v1/ocgcore.js')))).default;
 const core=await create({wasmBinary:readFileSync('public/replay/706-v1/ocgcore.wasm'),printErr:()=>{}});
 const engine=new PracticeEngine(core);engine.install(readFileSync('public/replay/706-v1/cards.data'),gunzipSync(readFileSync('public/replay/706-v1/scripts.data')));
 for(const player of [0,1]) {
  const deck={deckName:'XYZ regression',main:Array(40).fill(26202165),extra:[],side:[]};
  let frame=engine.open({decks:[deck,deck],seed:[1,2,3,4],rules:2,hand:5,noShuffle:true});let scene=advancePracticeScene(frame).scene;
  const update=()=>{frame=engine.next();const u=advancePracticeScene(frame,scene);scene=u.scene;return u;};
  while(!frame.pending)update();
  const source=`local xyz=Debug.AddCard(10002346,${player},${player},LOCATION_EXTRA,0,POS_FACEDOWN_DEFENSE)
   local a=Debug.AddCard(26202165,${player},${player},LOCATION_MZONE,0,POS_FACEUP_ATTACK)
   local b=Debug.AddCard(46986414,${player},${player},LOCATION_MZONE,1,POS_FACEUP_DEFENSE)
   local e=Effect.CreateEffect(a) e:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS) e:SetCode(EVENT_PHASE+PHASE_END) e:SetCountLimit(1)
   e:SetOperation(function() Duel.Overlay(xyz,Group.FromCards(a,b)) Duel.SpecialSummon(xyz,SUMMON_TYPE_XYZ,${player},${player},false,false,POS_FACEUP_DEFENSE) end) Duel.RegisterEffect(e,0)`;
  const bytes=Buffer.from(source+'\0'),p=core._malloc(bytes.length);core.HEAPU8.set(bytes,p);assert.equal(core._replay_evaluate(engine.handle,p),1);core._free(p);update();
  engine.respond(frame.pending.id,frame.pending.player,7);
  let sawPlace=false,sawAnimation=false;
  for(let i=0;i<300;i++) {
   const u=update();
   if(frame.pending?.kind==='place') {
    sawPlace=true;assert.equal(frame.pending.player,player);assert.equal(scene.materials.length,2);assert.ok(scene.materials.every(m=>m.atOrigin&&m.host.location===64),'Before selecting the destination, materials stay at their own origins');
    assert.deepEqual(scene.materials.map(m=>m.card.sequence).sort(),[0,1]);
    const target=frame.pending.choices.find(c=>c.sequence===3);assert.ok(target);assert.equal(engine.respond(frame.pending.id,player,[target.index]),true);
   } else if(frame.pending?.kind==='chain') engine.respond(frame.pending.id,frame.pending.player,-1);
   else if(frame.pending?.kind==='idle') break;
   if(u.animation.length) {
    sawAnimation=true;assert.equal(u.animation.length,4,'Initial positions, each material in turn, then host');
    assert.deepEqual(u.animation.map(s=>s.materials.filter(m=>!m.atOrigin).length),[0,1,2,2]);
    assert.ok(u.animation.slice(0,-1).every(s=>!s.cards.some(c=>c.code===10002346&&c.location===4)),'Host appears after all materials collect');
    assert.ok(u.animation.at(-1).cards.some(c=>c.code===10002346&&c.location===4&&c.sequence===3));
   }
  }
  assert.ok(sawPlace&&sawAnimation,'Native Core exercised an actual destination request and collection sequence');engine.close();
 }
 console.log('PASS native Core A/B XYZ: wait for slot, sequential materials, host last; chain modes preserve forced responses');
} finally {await vite.close();}
