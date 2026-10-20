import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {build,preview} from 'vite';
const folder='.audit-tmp/client-followup-ui',outDir=folder+'/web';mkdirSync(folder,{recursive:true});
const fixture=`
import {initUIContainer,getUIContainer} from '@/container/compat';
import * as stores from '@/stores';import * as api from '@/api';
import {settingStore} from '@/stores/settingStore';import {connectionStore} from '@/variant/connection';
import {beginActionRequest} from '@/service/duel/actionRequest';import {eventbus,Task} from '@/infra';
import result from '@/service/room/handResult';import {replayCaptureStatus} from '@/replay/capture';
window.__followup={stores,settingStore,replayCaptureStatus,sent:[],
init(){const sent=this.sent;initUIContainer({ws:{readyState:1,send(d){sent.push(Array.from(new Uint8Array(d.buffer||d)));},addEventListener(){},removeEventListener(){}},signal:new AbortController().signal,close(){}});stores.resetUniverse();const {matStore:m,roomStore:r}=stores;m.selfType=1;m.currentPlayer=0;m.turnCount=3;m.phase.currentPhase=3;m.initInfo.me={...m.initInfo.me,life:8000};m.initInfo.op={...m.initInfo.op,life:8000};r.joined=true;r.selfType=1;r.hostInfo={duelRule:2,mode:0,lflist:0x73ec4051,startLp:8000,startHand:5,drawCount:1,timeLimit:180};r.players=[{name:'Short',isMe:true,state:1},{name:'Very long opponent ID',isMe:false,state:1}];connectionStore.state='connected';settingStore.showZoneCounts=true;beginActionRequest(getUIContainer(),'idle');m.phase.enableEp=true;},
duel(observer=false){this.init();if(observer)stores.matStore.selfType=2;const Z=api.ygopro.CardZone;const c=(zone,sequence,controller)=>({uuid:zone+'-'+sequence+'-'+controller,code:0,meta:api.fetchCard(0),location:{controller,zone,sequence,position:8,is_overlay:false},idleInteractivities:[],counters:{},isToken:false,targeted:false,status:0,selectInfo:{selectable:false,selected:false}});stores.cardStore.inner=[0,1].flatMap(p=>[...Array.from({length:40},(_,i)=>c(Z.DECK,i,p)),...Array.from({length:15},(_,i)=>c(Z.EXTRA,i,p))]);location.hash='#/duel';},
room(){this.init();stores.roomStore.stage=stores.RoomStage.WAITING;location.hash='#/waitroom';},
rps(){stores.roomStore.stage=stores.RoomStage.HAND_SELECTING;eventbus.emit(Task.Mora);},
result(me,op){result(getUIContainer(),{stoc_hand_result:{meResult:me,opResult:op}});},
receipt(){stores.roomStore.joined=false;Object.assign(replayCaptureStatus,{state:'saved',notice:'Saved',saved:1});location.hash='#/match';}
};`;
let browser,server;
try{
 if(!process.argv.includes('--built')){await build({logLevel:'error',build:{outDir},plugins:[{name:'followup-test-only',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});}
 server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});const origin=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('language','cn'));
 await page.goto(origin,{waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
 const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);const run=name=>!only||only===name;
 if(run('counts')||run('rail')||run('mask')){
 for(const observer of [false,true]){
 await page.evaluate(observer=>window.__followup.duel(observer),observer);await expect(page.getByTestId('duel-menu')).toBeVisible();await page.waitForTimeout(800);
 if(run('counts'))for(const player of [0,1])for(const zone of ['DECK','EXTRA']){
 const badge=page.locator(`[data-testid="duel-zone"][data-zone="${zone}"][data-controller="${player}"] [data-testid="zone-count-badge"]`);
 await expect(badge).toHaveText(zone==='DECK'?'40':'15');
 const check=()=>badge.evaluate(el=>{el.style.pointerEvents='auto';const r=el.getBoundingClientRect();const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);el.style.pointerEvents='';return {visible:top===el||el.contains(top),rect:{x:r.x,y:r.y,width:r.width,height:r.height},transform:getComputedStyle(el).transform,top:top?.outerHTML.slice(0,500)};});
 await expect.poll(async()=>{const state=await check();if(!state.visible){await page.screenshot({path:folder+'/counts-failure.png'});console.log('Occluded count',player,zone,state);}return state.visible;},{timeout:5000,message:`${observer?'spectator':'player'} ${player} ${zone} count is above the nonempty pile`}).toBe(true);
 }
 if(run('rail'))for(const [width,height]of [[844,390],[568,320]]){
 await page.setViewportSize({width,height});await page.waitForTimeout(200);const ctrl=page.getByTestId('duel-sidebar-controls');
 assert.equal(await ctrl.evaluate(e=>e.scrollHeight>e.clientHeight+1),false,'IDs and all controls fit without scrolling');
 const menu=await page.getByTestId('duel-menu').boundingBox();assert.ok(menu.y+menu.height<=height,'All four controls fit in landscape');
 }
 if(run('mask')){await page.evaluate(()=>window.dispatchEvent(new CustomEvent('neos:open-settings',{detail:{defaultKey:'messages'}})));await page.getByTestId('setting-hide-player-ids').check();await page.getByTestId('settings-close').click();await expect(page.getByTestId('duel-player-name')).toHaveText(['********','********']);await expect(page.getByTestId('duel-turn-status')).not.toContainText('Short');await expect(page.getByTestId('duel-turn-status')).not.toContainText('Very long opponent ID');await page.evaluate(()=>window.__followup.settingStore.hidePlayerIds=false);await expect(page.getByTestId('duel-player-name').first()).not.toHaveText('********');}
 }
 await page.evaluate(()=>window.__followup.settingStore.showZoneCounts=false);await expect(page.getByTestId('zone-count-badge')).toHaveCount(0);
 await page.screenshot({path:folder+'/landscape.png'});
 }
 if(run('receipt')){await page.evaluate(()=>window.__followup.receipt());const receipt=page.getByTestId('replay-receipt');await expect(receipt).toBeVisible();await page.getByTestId('replay-receipt-close').click();await expect(receipt).not.toBeVisible();await page.evaluate(()=>Object.assign(window.__followup.replayCaptureStatus,{saved:2}));await expect(receipt).toBeVisible();await expect(receipt).not.toBeVisible({timeout:10000});}
 if(run('rps')){
 await page.evaluate(()=>window.__followup.room());await expect(page.getByTestId('waitroom-player-me')).toBeVisible();
 await page.evaluate(()=>window.__followup.settingStore.hidePlayerIds=true);await expect(page.locator('[data-player-name="********"]')).toHaveCount(2);await expect(page.locator('[title="Short"]')).toHaveCount(0);
 for(const [me,op,text]of [[2,1,'获胜'],[1,2,'落败'],[3,3,'平局'],[3,3,'平局']]){
 await page.evaluate(()=>{window.__followup.settingStore.randomRpsMode='off';window.__followup.rps();});
 await page.getByTestId('waitroom-mora-'+({1:'scissors',2:'rock',3:'paper'}[me])).click();
 await expect(page.locator('.ant-message')).toContainText('本次已出：');
 await page.evaluate(([me,op])=>window.__followup.result(me===1?2:me===2?1:me,op===1?2:op===2?1:op),[me,op]);await expect(page.locator('.ant-message')).toContainText('猜拳结果：'+text);
 }
 }
 assert.deepEqual(errors,[]);console.log('PASS populated pile overlays, short landscape controls, ID masking, dismissible replay receipt, manual RPS and repeated tie',only||'all');
}finally{await browser?.close();await server?.httpServer.close();}
