import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite=await createServer({server:{middlewareMode:true,watch:null},optimizeDeps:{disabled:true},logLevel:'error'});
try{
 const {parsePracticeRequest,encodePracticeAnswer}=await vite.ssrLoadModule('/src/practice/prompts.ts');
 for(const player of [0,1]){
   // Actual 706 normal-spell activation/set packet: zero count permits cancel,
   // but selecting a location still sends exactly one player/location/sequence.
   const p=parsePracticeRequest(new Uint8Array([18,player,0,255,224,255,255]),1);
   assert.deepEqual(Array.from(encodePracticeAnswer(p,[8])||[]),[player,8,0],'Optional placement must allow one selected S/T zone');
   assert.deepEqual(Array.from(encodePracticeAnswer(p,-1)||[]),[player,0,0]);
   assert.equal(encodePracticeAnswer(p,[]),undefined,'Empty selection is not a location response');
 }
 const multi=parsePracticeRequest(new Uint8Array([24,1,2,252,255,255,255]),2);
 assert.deepEqual(Array.from(encodePracticeAnswer(multi,[0,1])),[1,4,0,1,4,1]);
 assert.equal(encodePracticeAnswer(multi,-1),undefined);
 console.log('PASS actual optional spell placement, cancel encoding, both players and required multi-zone selection');
}finally{await vite.close();}
