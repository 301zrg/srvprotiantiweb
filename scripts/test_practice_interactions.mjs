import assert from 'node:assert/strict';
import {needsPracticePrompt,choicesAtCard} from '../src/practice/interactions.ts';
const request=(kind,location)=>({id:1,message:0,kind,player:0,min:1,max:1,cancelable:false,choices:[{index:0,player:0,location,sequence:0}]});
assert.equal(needsPracticePrompt(undefined),false);
for(const kind of ['idle','battle','place'])assert.equal(needsPracticePrompt(request(kind,64)),false,'Extra-deck commands must not open a long operation list');
assert.equal(needsPracticePrompt(request('cards',4)),false,'Field targets stay directly selectable');
for(const location of [1,16,32,64,128])assert.equal(needsPracticePrompt(request('cards',location)),true,'Off-board candidates must be visible');
for(const kind of ['chain','sort','yesno','position','bits','announce','counter','option'])assert.equal(needsPracticePrompt(request(kind,2)),true,'Every non-board input opens its controls');
console.log('PASS prompt routing for normal commands, field targets and all off-board/input kinds');

const materials={...request('cards',132),choices:[{index:0,player:0,location:132,sequence:2,value:0},{index:1,player:0,location:132,sequence:2,value:1}]};
assert.deepEqual(choicesAtCard(materials,{player:0,location:132,sequence:2,overlayIndex:1}).map(c=>c.index),[1],'Detaching material 1 must not choose material 0 on the same host');
