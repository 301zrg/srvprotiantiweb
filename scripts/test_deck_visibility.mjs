import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({server:{middlewareMode:true,watch:null},optimizeDeps:{disabled:true},logLevel:'error'});
try {
 const {deckCardFaceUp,visibleDeckCode}=await vite.ssrLoadModule('/src/ui/Duel/PlayMat/deckVisibility.ts');
 const {deckVisibilityMessage}=await vite.ssrLoadModule('/src/api/ocgcore/ocgAdapter/stoc/stocGameMsg/deckVisibility.ts');
 const hidden={code:46986414,location:{position:5}};
 assert.equal(visibleDeckCode(hidden,false),0);
 assert.equal(visibleDeckCode(hidden,true),0,'Whole-deck reversal must not reveal an identity cached while hidden');
 assert.equal(visibleDeckCode({...hidden,location:{position:2}},false),46986414);
 for(const reversed of [false,true])for(const individual of [false,true]) {
   const card={...hidden,deckReversed:individual,deckPublicCode:26202165};
   assert.equal(deckCardFaceUp(card,reversed),individual!==reversed);
   assert.equal(visibleDeckCode(card,reversed),individual!==reversed?26202165:0);
 }
 const bytes=new Uint8Array(10);bytes[2]=1;bytes[3]=3;new DataView(bytes.buffer).setUint32(4,0x80000000+26202165,true);
 assert.deepEqual(deckVisibilityMessage(38,bytes.subarray(2,8)).deckVisibility,{kind:'top',player:1,offset:3,code:26202165,reversed:true},'Signed public code and nonzero byte offset must decode correctly');
 assert.deepEqual(deckVisibilityMessage(37,new Uint8Array()).deckVisibility,{kind:'reverse'});
 console.log('PASS native deck orientation, public identity masking and packet offsets');
} finally {await vite.close();}
