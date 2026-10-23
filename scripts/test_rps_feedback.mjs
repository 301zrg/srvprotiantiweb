import assert from 'node:assert/strict';
import {rpsOutcome,rpsFeedback,notifyRpsPlayed,notifyRpsResult} from '../src/service/mora/feedback.ts';
const expected=[['tie','lose','win'],['win','tie','lose'],['lose','win','tie']];
for(let me=1;me<=3;me++)for(let op=1;op<=3;op++)assert.equal(rpsOutcome(me,op),expected[me-1][op-1]);
const before=rpsFeedback.result.serial;notifyRpsResult(3,3);notifyRpsResult(3,3);assert.equal(rpsFeedback.result.serial,before+2,'Each repeated tie produces a new notice');
notifyRpsResult(0,2);assert.equal(rpsFeedback.result.serial,before+2,'Incomplete hand results produce no outcome');
notifyRpsPlayed(2);assert.equal(rpsFeedback.played.hand,2);assert.equal(rpsFeedback.result.outcome,'tie','Played and result notices remain independent');
console.log('PASS nine 706 hand outcomes, repeated ties and separate played/result notices');
