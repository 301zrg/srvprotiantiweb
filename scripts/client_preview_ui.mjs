import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/client-preview-ui", outDir = `${folder}/web`;
mkdirSync(folder, {recursive:true});
const fixture = `
import {initUIContainer as initPreview} from '@/container/compat';
import * as previewStores from '@/stores';
import * as previewApi from '@/api';
import {editDeckStore as previewDeck} from '@/ui/BuildDeck/store';
import {setSelectedDeck as selectPreviewDeck} from '@/ui/BuildDeck';
window.__preview={...previewStores,...previewApi,previewDeck,selectPreviewDeck,
duel(populate=false){
initPreview({ws:{readyState:1,send(){}},cancelled:false,isClosed:false,signal:new AbortController().signal,close(){}});
previewStores.resetUniverse();
const {matStore:m,roomStore:r,cardStore:c}=previewStores;
m.selfType=1;m.currentPlayer=0;m.turnCount=3;m.phase.currentPhase=4;
m.initInfo.me={...m.initInfo.me,life:8000};m.initInfo.op={...m.initInfo.op,life:6200};m.timeLimits.me=180;m.timeLimits.op=175;
r.joined=true;r.hostInfo={duelRule:2,mode:0};r.players=[{name:'Preview A',isMe:true,state:1},{name:'Preview B',isMe:false,state:1}];
if(populate){const Z=previewApi.ygopro.CardZone;const make=(zone,sequence,code,controller=0)=>({uuid:zone+'-'+sequence+'-'+controller,code,meta:previewApi.fetchCard(code),location:{controller,zone,sequence,position:previewApi.ygopro.CardPosition.FACEUP_ATTACK,is_overlay:false},idleInteractivities:[],counters:{},isToken:false,targeted:false,status:0,selectInfo:{selectable:false,selected:false}});c.inner=[...Array.from({length:6},(_,i)=>make(Z.HAND,i,69247929)),...Array.from({length:5},(_,i)=>make(Z.HAND,i,0,1)),make(Z.MZONE,0,89631139),make(Z.SZONE,2,83764718)];}
location.hash='#/duel';
}};`;
let browser, server;
const results=[];
try {
  if(!process.argv.includes('--built')) {
    await build({logLevel:'error',build:{outDir},plugins:[{name:'preview-test-only',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});
    execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});
  }
  server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});
  const origin=server.resolvedUrls.local[0];
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  for(const [name,width,height,touch] of [['desktop',1440,900,false],['landscape',844,390,true],['short',568,320,true],['portrait',390,844,true],['narrow',320,640,true]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:touch,hasTouch:touch});
    await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
    await context.addInitScript(()=>localStorage.setItem('language','cn'));
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:45000});
    await page.evaluate(()=>window.__preview.duel());
    await expect(page.getByTestId('duel-menu')).toBeVisible();
    for(const zone of ['DECK','EXTRA','GRAVE','REMOVED']){
      const block=page.locator('[data-testid="duel-zone"][data-controller="0"][data-zone="'+zone+'"]');
      await block.click();
      const panel=page.getByTestId('duel-card-list-panel');
      await expect(panel).toBeVisible({timeout:1500});
      await expect(page.getByTestId('duel-card-list')).toHaveAttribute('data-card-count','0');
      await expect(panel).toContainText('此区域没有卡片。');
      await page.getByTestId('duel-card-list-panel-close').click();
    }
    if(process.argv.includes('--red-only'))break;
    await page.evaluate(()=>window.__preview.duel(true));await page.waitForTimeout(800);
    await page.screenshot({path:folder+'/'+name+'-duel.png'});
    await page.evaluate(()=>{const v=window.__preview; const seed=v.cardStore.inner[0]; for(let i=0;i<3;i++)v.cardStore.inner.push({...seed,uuid:'hidden-main-'+i,location:{...seed.location,zone:v.ygopro.CardZone.DECK,sequence:i}});});
    const deckTop=page.locator('[data-testid="duel-card"][data-card-zone="DECK"][data-card-controller="0"]').last();
    await deckTop.click();
    await expect(page.getByTestId('duel-card-list')).toHaveAttribute('data-card-count','3');
    await expect(page.getByTestId('duel-card-list').locator('[data-card-code]')).toHaveCount(0);
    await page.getByTestId('duel-card-list-panel-close').click();
    const board=await page.getByTestId('duel-board-viewport').boundingBox();
    assert.ok(board.width>240&&board.height>150,name+' usable board');
    const monster=page.locator('[data-testid="duel-card"][data-card-zone="MZONE"]').first();
    const ground=page.locator('[data-testid="duel-zone"][data-zone="MZONE"][data-controller="0"][data-sequence="0"]');
    const mc=await monster.boundingBox(), gc=await ground.boundingBox();
    assert.ok(Math.abs(mc.x+mc.width/2-gc.x-gc.width/2)<3 && Math.abs(mc.y+mc.height/2-gc.y-gc.height/2)<3, name+' card animation matches slots');
    const hand=await page.locator('[data-testid="duel-card"][data-card-zone="HAND"][data-card-controller="0"]').first().boundingBox();
    assert.ok(hand&&hand.y>=-2&&hand.y+hand.height<=height+2,name+' hand visible');
    assert.deepEqual(errors,[],name+' page errors');
    results.push({name,board,hand,errors});
    await context.close();
  }
  console.log('PASS preview empty regions and responsive board:',results.length);
} finally {writeFileSync(folder+'/results.json',JSON.stringify(results,null,2));await browser?.close();await server?.httpServer.close();}
