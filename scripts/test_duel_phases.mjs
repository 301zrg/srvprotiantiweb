import assert from 'node:assert/strict';
import { phaseAction, corePhaseKey, onlinePhaseKey } from '../src/variant/duelPhases.ts';
const first={current:'mp1',command:'idle',ownTurn:true,enableBp:false,enableM2:false,enableEp:true};
assert.equal(phaseAction(first,'bp'),undefined);
assert.equal(phaseAction(first,'mp2'),undefined);
assert.deepEqual(phaseAction(first,'ep'),{source:'idle',response:7});
const forced={...first,enableBp:true,enableEp:false};
assert.deepEqual(phaseAction(forced,'bp'),{source:'idle',response:6});
assert.equal(phaseAction(forced,'ep'),undefined);
const battle={...first,current:'bp',command:'battle',enableM2:true};
assert.deepEqual(phaseAction(battle,'mp2'),{source:'battle',response:2});
assert.deepEqual(phaseAction(battle,'ep'),{source:'battle',response:3});
for(const phase of ['dp','sp','mp1','bp','mp2','ep']) {
  assert.equal(phaseAction({...battle,command:undefined},phase),undefined);
  assert.equal(phaseAction({...battle,ownTurn:false},phase),undefined);
}
assert.equal(phaseAction({...battle,enableM2:false,enableEp:false},'mp2'),undefined);
assert.equal(phaseAction({...battle,enableM2:false,enableEp:false},'ep'),undefined);
for(const phase of [8,16,32,64,128])assert.equal(corePhaseKey(phase),'bp');
for(const phase of [4,5,6,7,8])assert.equal(onlinePhaseKey(phase),'bp');
assert.equal(corePhaseKey(4),'mp1');assert.equal(onlinePhaseKey(3),'mp1');
console.log('PASS authoritative phase flags, source-specific responses, skipped/forced phases, stale/opponent blocking and Core/protobuf phase mapping');
