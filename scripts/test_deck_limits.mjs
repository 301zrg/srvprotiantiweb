import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/ui/BuildDeck/store.ts"], bundle: true, write: false,
  format: "cjs", platform: "browser", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-deck-fixtures", setup(b) {
    b.onResolve({ filter: /^@\/api$|^@\/variant$|^@\/common$|^\.\/utils$/ }, a => ({ path: a.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents:
      a.path === "@/api" ? "export const forbidden={get:c=>globalThis.__limits.get(c.id)??globalThis.__limits.get(c.data.alias)};" :
      a.path === "@/variant" ? "export const getLanguage=()=> 'cn';" :
      a.path === "./utils" ? "export const compareCards=(a,b)=>a.id-b.id;" :
      "export const isToken=t=>!!(t&0x4000);export const isExtraDeckCard=t=>!!(t&(0x40|0x2000|0x800000|0x4000000));"
    }));
  }}],
});
const limits = new Map([[1,0],[2,1],[3,2]]);
const exports = {}, context = { exports, module:{exports}, __limits:limits, console, queueMicrotask, setTimeout };
vm.runInNewContext(result.outputFiles[0].text, context);
const s = context.module.exports.editDeckStore;
const card = (id, alias=0, type=1) => ({id,data:{alias,type},text:{name:String(id)}});
const a=card(1), b=card(2), alt=card(20,2), c=card(3), extra=card(4,0,0x40);
const reset=()=>{s.set({deckName:"fixture",main:[],extra:[],side:[]});s.ignoreBanlist=false;};
reset(); assert.equal(s.canAdd(a,"main","search").result,false);
s.ignoreBanlist=true;
assert.equal(s.canAdd(a,"main","search").result,true,"Ignore banlist permits forbidden cards");
s.add("main",a);s.add("side",a);s.add("main",a);
assert.equal(s.canAdd(a,"main","search").result,false,"Ignored banlist still enforces three total copies");
assert.equal(s.canAdd(a,"side","main").result,true,"Moving a copy between zones does not add a copy");
reset();s.add("main",b);assert.equal(s.canAdd(alt,"side","search").result,false,"Alias shares limited-card allowance");
s.ignoreBanlist=true;s.add("side",alt);s.add("main",b);
assert.equal(s.canAdd(alt,"side","search").result,false,"Alias shares three-copy cap across main/side");
assert.deepEqual(Array.from(s.main,x=>x.id),[2,2],"Checks preserve manual order");
s.ignoreBanlist=false;assert.equal(s.main.length+s.side.length,3,"Reenabling banlist never discards cards");
reset();s.add("main",c);assert.equal(s.canAdd(c,"main","search").result,true);s.add("side",c);assert.equal(s.canAdd(c,"main","search").result,false);
s.ignoreBanlist=true;assert.equal(s.canAdd(extra,"main","search").result,false);assert.equal(s.canAdd(extra,"extra","search").result,true);
assert.equal(s.canAdd(card(9,0,0x4000),"main","search").result,false,"Tokens remain prohibited");
s.main=Array.from({length:60},(_,i)=>card(100+i));assert.equal(s.canAdd(card(400),"main","search").result,false,"Main-deck capacity remains enforced");
console.log("PASS deck banlist bypass, canonical copies, moves, ordering, type and capacity boundaries");
