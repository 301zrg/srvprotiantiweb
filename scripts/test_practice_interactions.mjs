import assert from 'node:assert/strict';
import {needsPracticePrompt} from '../src/practice/interactions.ts';
const request=(kind,location)=>({id:1,message:0,kind,player:0,min:1,max:1,cancelable:false,choices:[{index:0,player:0,location,sequence:0}]});
assert.equal(needsPracticePrompt(undefined),false);
for(const kind of ['idle','battle','place'])assert.equal(needsPracticePrompt(request(kind,64)),false,'Extra-deck commands must not open a long operation list');
assert.equal(needsPracticePrompt(request('cards',4)),false,'Field targets stay directly selectable');
for(const location of [1,16,32,64,128])assert.equal(needsPracticePrompt(request('cards',location)),true,'Off-board candidates must be visible');
for(const kind of ['chain','sort','yesno','position','bits','announce','counter','option'])assert.equal(needsPracticePrompt(request(kind,2)),true,'Every non-board input opens its controls');
console.log('PASS prompt routing for normal commands, field targets and all off-board/input kinds');
