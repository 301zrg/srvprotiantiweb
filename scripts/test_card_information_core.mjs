// Real locked 706 queries, with the same relation methods as the actual scripts.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'vite';

const scripts=gunzipSync(readFileSync('public/replay/706-v1/scripts.data'));
const n=scripts.readUInt32LE(0), index=JSON.parse(scripts.subarray(4,4+n));
for(const id of [25924653,76515293,50078509]) {
 const entry=index.find(e=>e.name.endsWith(`c${id}.lua`));
 assert.ok(entry);
 assert.match(scripts.subarray(4+n+entry.offset,4+n+entry.offset+entry.bytes).toString('utf8'),/:SetCardTarget\(tc\)/);
}
const vite=await createServer({server:{middlewareMode:true,watch:null},optimizeDeps:{disabled:true},logLevel:'error'});
try {
 const {PracticeEngine}=await vite.ssrLoadModule('/src/practice/engine.ts');
 const {seedScene}=await vite.ssrLoadModule('/src/ui/Shared/DuelBoard/scene.ts');
 const {advancePracticeScene}=await vite.ssrLoadModule('/src/ui/Practice/presentation.ts');
 const create=(await import(pathToFileURL(resolve('public/replay/706-v1/ocgcore.js')))).default;
 const core=await create({wasmBinary:readFileSync('public/replay/706-v1/ocgcore.wasm'),printErr:text=>console.error(text)});
 const engine=new PracticeEngine(core);
 engine.install(readFileSync('public/replay/706-v1/cards.data'),scripts);
 const deck={deckName:'Relation audit',main:Array(40).fill(89631139),extra:[],side:[]};
 engine.open({decks:[deck,deck],seed:[11,22,33,44],hand:0,rules:2,noShuffle:true});
 const evaluate=source=>{
  const bytes=Buffer.from(source+'\0'), p=core._malloc(bytes.length);core.HEAPU8.set(bytes,p);
  try{assert.equal(core._replay_evaluate(engine.handle,p),1,core.UTF8ToString(core._replay_error()));}finally{core._free(p);}
 };
 evaluate(`
  auditDarius=Debug.AddCard(25924653,0,0,LOCATION_MZONE,0,POS_FACEUP_ATTACK)
  auditMonster=Debug.AddCard(89631139,1,1,LOCATION_MZONE,2,POS_FACEUP_DEFENSE)
  auditTrap=Debug.AddCard(76515293,0,0,LOCATION_SZONE,1,POS_FACEUP_ATTACK)
  auditSet1=Debug.AddCard(14087893,1,1,LOCATION_SZONE,2,POS_FACEDOWN_DEFENSE)
  auditSet2=Debug.AddCard(83764718,1,1,LOCATION_SZONE,3,POS_FACEDOWN_DEFENSE)
  auditEquip=Debug.AddCard(56747793,0,0,LOCATION_SZONE,0,POS_FACEUP_ATTACK)
  auditDarius:SetCardTarget(auditMonster)
  auditTrap:SetCardTarget(auditSet1)
  auditTrap:SetCardTarget(auditSet2)
  Debug.PreEquip(auditEquip,auditMonster)
 `);
 const before=engine.frame([]), scene=seedScene(before);
 const find=(cards,code)=>cards.find(c=>c.code===code);
 assert.deepEqual(find(before.cards,25924653).targetLocations,[{player:1,location:4,sequence:2}]);
 assert.deepEqual(find(before.cards,76515293).targetLocations,[{player:1,location:8,sequence:2},{player:1,location:8,sequence:3}]);
 assert.deepEqual(find(before.cards,56747793).equipLocation,{player:1,location:4,sequence:2});
 assert.equal(find(scene.cards,25924653).cardTargets[0],scene.cards.find(c=>c.code===89631139&&c.location===4).sceneId);
 assert.equal(find(scene.cards,76515293).cardTargets.length,2);
 assert.equal(find(scene.cards,14087893).position,8,'A face-down target still appears in the authoritative relation query');
 evaluate('auditDarius:CancelCardTarget(auditMonster); auditTrap:CancelCardTarget(auditSet1)');
 const after=engine.frame([]), cleared=seedScene(after,scene);
 assert.deepEqual(find(cleared.cards,25924653).cardTargets,[]);
 assert.equal(find(cleared.cards,76515293).cardTargets.length,1);
 assert.equal(find(cleared.cards,76515293).cardTargets[0],find(cleared.cards,83764718).sceneId);
 // Actual unmodified Moon script, including normal native selection/response.
 evaluate('auditDarius:SetCardTarget(auditMonster); Debug.AddCard(14087893,0,0,LOCATION_HAND,0,POS_FACEDOWN_DEFENSE)');
 engine.setChainMode(0);
 const trace=[];
 let activated=false, set=false, flipped=false, live, liveScene;
 for(let step=0;step<500&&!flipped;step++) {
  live=engine.next(); trace.push(...live.events);
  liveScene=advancePracticeScene(live,liveScene).scene;
  for(const event of live.events) {
   if(event[0]===70&&Buffer.from(event).readUInt32LE(1)===14087893) activated=true;
   if(event[0]===53&&event[6]===4&&event[7]===2&&event[9]===8) set=true;
   if(set&&event[0]===53&&event[6]===4&&event[7]===2&&(event[9]&5)) flipped=true;
  }
  if(set) {
   assert.deepEqual(live.cards.find(c=>c.code===25924653&&c.location===4).targetLocations,[],'Real Moon removes the Darius link');
   assert.deepEqual(liveScene.cards.find(c=>c.code===25924653&&c.location===4).cardTargets,[],'Rendered scene must not restore the cancelled link after flipping up');
  }
  const p=live.pending;if(!p)continue;
  let answer;
  if(p.kind==='idle') {
   const moon=!activated&&p.choices.find(c=>c.action===5&&c.code===14087893);
   const flip=set&&p.player===1&&p.choices.find(c=>c.action===2&&c.code===89631139&&c.sequence===2);
   answer=moon?moon.value:flip?flip.value:7;
  } else if(p.kind==='chain')answer=p.cancelable?-1:p.choices[0]?.value;
  else if(['cards','tribute','unselect','sum'].includes(p.kind)) {
   const card=p.choices.find(c=>c.location===4&&c.player===1&&c.sequence===2)||p.choices[0];
   answer=[card.index];
  } else if(p.kind==='yesno')answer=0;
  else if(p.kind==='position')answer=p.choices.find(c=>c.value&5)?.value??p.choices[0]?.value;
  else if(p.kind==='place')answer=p.choices.slice(0,p.min).map(c=>c.index);
  else answer=p.choices[0]?.value;
  assert.equal(engine.respond(p.id,p.player,answer),true,JSON.stringify(p));
 }
 assert.ok(activated&&set&&flipped,'Need actual Moon activation, set and later flip');
 mkdirSync('.audit-tmp/card-information-core',{recursive:true});
 writeFileSync('.audit-tmp/card-information-core/report.json',JSON.stringify({before,after,trace,final:live},null,2));
 engine.close();
 console.log('PASS real 706 Core query: monster source, two face-down S/T targets, equip, explicit cancellation; unchanged actual scripts declare these links');
} finally {await vite.close();}
