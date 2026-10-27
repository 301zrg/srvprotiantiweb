import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transform} from 'esbuild';
const path='src/service/duel/rockPaperScissors.ts';
const source=process.argv.includes('--baseline')?execFileSync('git',['show','cba628e4:'+path],{encoding:'utf8'}):readFileSync(path,'utf8');
const captured=[];
globalThis.__captureRps=async(...args)=>captured.push(args);
const translated=source.replace('import { displayOptionModal } from "@/ui/Duel/Message";', 'const displayOptionModal = globalThis.__captureRps;');
const compiled=await transform(translated,{loader:'ts',format:'esm'});
mkdirSync('.audit-tmp/rps-mapping',{recursive:true});
const out=resolve('.audit-tmp/rps-mapping/'+(process.argv.includes('--baseline')?'baseline':'current')+'-service.mjs');writeFileSync(out,compiled.code);
const service=await import(pathToFileURL(out));await service.default({player:0});
const choices=captured[0][1];
// The 706 Core and CTOS_HAND_RESULT share scissors=1, rock=2, paper=3.
assert.deepEqual(choices.map(c=>c.response),[2,1,3],'Visible Rock/Scissors/Paper must send the matching 706 hand code');
console.log('PASS effect RPS labels match actual 706 hand codes');
