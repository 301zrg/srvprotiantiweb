import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({server:{middlewareMode:true,watch:null},optimizeDeps:{disabled:true},logLevel:'error'});
try {
  const {advancePracticeScene,practiceEffectText}=await vite.ssrLoadModule('/src/ui/Practice/presentation.ts');
  const {seedScene}=await vite.ssrLoadModule('/src/ui/Replay/scene.ts');
  const frame={step:0,consumed:0,total:0,events:[],cards:[],lp:[8000,8000],names:['A','B'],turn:1,phase:4,turnPlayer:0};
  let scene=seedScene(frame);
  const next={...frame,step:1,events:[[54,1,0,0,0,0,8,0,2]]};
  let update=advancePracticeScene(next,scene);
  assert.deepEqual(update.actions.map(a=>a.kind),['set'],'Final queried snapshot must not replay the last sound');
  scene=update.scene;
  update=advancePracticeScene({...frame,step:2},scene);
  assert.equal(update.actions.length,0,'An eventless Core frame must not replay a previous sound');
  update=advancePracticeScene({...next,step:3,events:[next.events[0],next.events[0]]},scene);
  assert.equal(update.actions.length,2,'Separate identical events are still separate actions');
  const system=id=>({200:'Activate [%ls] in [%ls]?',221:'Trigger [%ls] in [%ls]?',95:'Detach from [%ls] instead?'}[id]||String(id));
  const text=practiceEffectText({message:12,description:0,code:10002346,location:4},system,system,()=> 'Gachi',()=> 'Monster Zone');
  assert.equal(text,'Activate Monster Zone in Gachi?');
  assert.equal(practiceEffectText({message:13,description:95,code:10002346},system,system,()=> 'Gachi',()=> ''),'Detach from Gachi instead?');
  const {materialOffset}=await vite.ssrLoadModule('/src/ui/Duel/PlayMat/materials.ts');
  for(const count of [1,2,20]) for(const height of [88,120]) for(const rotation of [0,180]) for(let i=0;i<count;i++) {
    const offset=materialOffset(i,count,height,rotation);
    assert.ok(Math.abs(offset.y)<0.001,'Materials stay portrait in their own row, including defense hosts');
    assert.ok(2*Math.abs(offset.x)+height*5.9/8.6<=120,'Entire material fan fits inside its monster slot');
  }
  console.log('PASS practice event audio identity and effect text substitution');
} finally {await vite.close();}
