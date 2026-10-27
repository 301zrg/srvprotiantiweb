import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Exercise the actual store and phase handler without loading unrelated card DB/UI modules.
const out=resolve('.audit-tmp/side-editor/store.mjs');
mkdirSync(resolve('.audit-tmp/side-editor'),{recursive:true});
const compiled=await build({stdin:{contents:`export {SideStore, SideStage} from './src/stores/sideStore'; export {handleChangeSide} from './src/service/side/changeSide';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',external:['valtio'],plugins:[{
  name:'side-editor-dependencies',
  setup(builder){
    builder.onResolve({filter:/^@\/stores$/},()=>({path:resolve('src/stores/sideStore.ts')}));
    builder.onResolve({filter:/^\.\/deckStore$/},()=>({path:'deck',namespace:'fixture'}));
    builder.onResolve({filter:/^@\/variant\/deployment$/},()=>({path:'key',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='deck'?`export const emptyDeck={deckName:'',main:[],extra:[],side:[]};`:`export const storageKey=(key)=>key;`,loader:'js'}));
  }
}]});
writeFileSync(out,compiled.outputFiles[0].text);
const storage=new Map();
globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const {SideStore,SideStage,handleChangeSide}=await import(pathToFileURL(out));
const store=new SideStore(),context={context:{sideStore:store}};
const first={deckName:'G1',main:[1,2],extra:[3],side:[4]};
const submitted={deckName:'G2',main:[1,4],extra:[3],side:[2]};
store.setSideDeck(first);
handleChangeSide(context,{});
const editor=store.getEditor();
editor.draft.main=[1,4];editor.draft.side=[2];editor.scrollTop=120;
assert.deepEqual(store.getSideDeck(),first,'unsubmitted edits must not replace the saved deck');
assert.equal(editor.draft.deckName,'G1','deck metadata must survive draft initialization');
handleChangeSide(context,{});
assert.equal(store.editor,editor,'same-phase restoration preserves the editor');
store.stage=SideStage.SIDE_CHANGED;
handleChangeSide(context,{});
assert.equal(store.editor,editor,'rejected/reopened Side preserves the same baseline');
store.setSideDeck(submitted);
store.stage=SideStage.DUEL_START;
handleChangeSide(context,{});
assert.equal(store.editor,undefined,'a new Side phase clears the previous editor');
const next=store.getEditor();
assert.deepEqual(next.initialDeck,submitted,'G2-to-G3 Side resets from the most recently submitted deck');
assert.deepEqual(next.draft,submitted);
assert.equal(next.scrollTop,0);
store.reset();
assert.equal(store.editor,undefined,'leaving clears temporary editor state');
assert.equal(store.stage,SideStage.NONE);
assert.equal(storage.size,0);
console.log('PASS Side editor: unsent draft isolation, reopen, next-game baseline, exit cleanup and deck metadata');
