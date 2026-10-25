import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { build, preview } from 'vite';

const folder = '.audit-tmp/card-information-ui', outDir = folder + '/web';
mkdirSync(folder, { recursive: true });
const base = readFileSync('scripts/client_followup_ui.mjs','utf8').match(/const fixture=`([\s\S]*?)`;\r?\nlet browser/)[1];
const prior = readFileSync('scripts/client_round4_ui.mjs','utf8').match(/const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/)[1];
const fixture = base + prior + `
import {showCardModal,closeCardModal} from '@/ui/Duel/Message/CardModal';
import {RelatedCards,CardCounters} from '@/ui/Shared/CardInformation';
import {sceneInformationCards} from '@/ui/Shared/DuelBoard/sceneInformation';
import {seedScene} from '@/ui/Shared/DuelBoard/scene';
window.__info={
 online(){window.__round4.online();const c=(...args)=>window.__round4.card(...args);const m=c(10002346,2,2,1),e=c(56747793,3,0),t=c(76515293,3,1),s=c(46986414,3,2,1);s.location.position=3;m.counters={1:3,2:2,65534:1};stores.cardStore.inner=[m,e,t,s,c(26202165,2,2,1,true,0),c(46986414,2,2,1,true,1)];this.ids=stores.cardStore.inner.map(c=>c.uuid);window.__round4.packet([93,0,8,0,1,1,4,2,1]);window.__round4.packet([96,0,8,1,1,1,4,2,1]);window.__round4.packet([96,0,8,1,1,1,8,2,8]);window.__followup.sent.length=0;},
 detail(index){showCardModal(stores.cardStore.inner[index]);},close(){closeCardModal();},
 practice(){location.hash='#/match';document.getElementById('root').style.display='none';const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;display:flex';document.body.append(host);const rc=(code,player,location,sequence,extra={})=>({code,player,location,sequence,position:1,type:1,attack:1500,defense:1000,level:4,rank:0,overlay:[],counters:[],...extra});const cards=[rc(25924653,0,4,0,{targetLocations:[{player:1,location:4,sequence:2}]}),rc(10002346,1,4,2,{position:4,overlay:[26202165,46986414],counters:[(3<<16)|1,(2<<16)|2,(1<<16)|65534]}),rc(76515293,0,8,1,{type:4,targetLocations:[{player:1,location:8,sequence:2}]}),rc(46986414,1,8,2,{position:8,type:2})];const frame=seedScene({step:0,cards,names:['A','B'],lp:[8000,8000],turn:3,turnPlayer:0,phase:4,events:[],consumed:0,total:0});const root=createRoot(host);root.render(React.createElement('div',{className:'practice-session',style:{width:'100%',height:'100%'}},React.createElement(PracticeBoard,{frame,language:'cn',disabled:false,selected:[],onToggle(){},onChoose(){},onInspect(){}}),React.createElement('div',{id:'practice-fixture-details',style:{position:'absolute',top:0,right:0,width:230,zIndex:1100,background:'#172033'}},React.createElement(RelatedCards,{id:frame.cards[1].sceneId,cards:sceneInformationCards(frame.cards,'cn',0,true),language:'cn'}),React.createElement(CardCounters,{counters:frame.cards[1].counters}))));this.pframe=frame;}
};`;
let browser, server;
const report=[];
try {
 if(!process.argv.includes('--built')) {
  await build({logLevel:'error',build:{outDir},plugins:[{name:'card-information-test-only',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});
  execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});
 }
 server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const [width,height] of [[1440,900],[844,390],[390,844],[320,640]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('language','cn'));
  try {
   await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded',timeout:60000});
   await expect(page.locator('main[data-ready=true]')).toBeVisible({timeout:60000});
   await page.evaluate(()=>window.__info.online());
   await expect(page.getByTestId('card-counter-badge')).toHaveCount(3);
   const ids=await page.evaluate(()=>window.__info.ids);
   const host=page.locator('[data-card-info-id="'+ids[0]+'"]');
   await host.locator('..').focus();
   await expect(page.getByTestId('card-link-line')).toHaveCount(2);
   await host.locator('..').evaluate(node=>node.blur());
   await host.hover();
   await expect(page.getByTestId('card-link-line')).toHaveCount(2);
   await expect(page.locator('[data-testid=card-link-line][data-link-kind=equip]')).toHaveCount(1);
   await expect(page.locator('[data-testid=card-link-line][data-link-kind=card]')).toHaveCount(1);
   await page.evaluate(()=>window.__info.detail(0));
   await expect(page.getByTestId('related-card-details').locator('button')).toHaveCount(2);
   await expect(page.getByTestId('duel-card-counter')).toHaveCount(3);
   await expect(page.getByTestId('duel-card-counter').last()).toContainText('0xfffe');
   await page.getByTestId('related-card-details').locator('button').first().click();
   await expect(page.getByTestId('duel-card-detail')).not.toBeVisible();
   await expect(page.getByTestId('card-link-line')).toHaveCount(1);
   await page.evaluate(()=>window.__info.detail(2));
   const hidden=page.getByTestId('related-card-details').locator('button').last();
   await expect(hidden).toContainText('里侧');
   await expect(hidden.locator('img')).toHaveAttribute('src',/card_back/);
   await page.evaluate(()=>window.__info.close());
   if(width<1000) {
    await host.tap();
    await expect(page.getByTestId('card-link-line')).toHaveCount(2);
    await page.evaluate(()=>window.__info.close());
   }
   const geometry=await page.getByTestId('card-counter-badge').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();const h=n.parentElement.parentElement.getBoundingClientRect();return{type:n.dataset.counterType,x:r.x,y:r.y,right:r.right,bottom:r.bottom,host:{x:h.x,y:h.y,right:h.right,bottom:h.bottom}};}));
   assert.equal(geometry.length,3);
   assert.ok(geometry[0].y>geometry[1].y&&geometry[1].y>geometry[2].y,'Each type stacks independently upward');
   for(const r of geometry)assert.ok(r.x>=r.host.x-1&&r.right<=r.host.right+1&&r.y>=r.host.y-1&&r.bottom<=r.host.bottom+1,'Counter badges stay inside screen-space card bounds');
   await page.screenshot({path:folder+'/'+width+'-online.png'});
   await page.evaluate(()=>{const c=window.__followup.stores.cardStore.inner[0];c.location.position=2;});
   await expect(page.getByTestId('card-counter-badge')).toHaveCount(3);
   await page.waitForTimeout(450);
   await page.screenshot({path:folder+'/'+width+'-defense.png'});
   assert.equal(await page.evaluate(()=>window.__followup.sent.length),0,'Hover, detail and locate never send a duel response');
   await page.evaluate(()=>window.__round4.packet([97,0,8,1,1,1,8,2,8]));
   await page.evaluate(()=>window.__info.detail(2));
   await expect(page.getByTestId('related-card-details').locator('button')).toHaveCount(1);
   await page.evaluate(()=>window.__info.close());
   await page.evaluate(()=>{
    window.__followup.stores.matStore.selfType=3;
    window.__followup.stores.matStore.observerView=1;
    window.__followup.stores.cardStore.inner[1].location.position=3;
    window.__info.detail(0);
   });
   await expect(page.getByTestId('related-card-details').locator('button').first()).toContainText('里侧');
   await expect(page.getByTestId('related-card-details').locator('button').first()).toContainText('从左第 5 格');
   await expect(page.getByTestId('related-card-details').locator('button').first().locator('img')).toHaveAttribute('src',/card_back/);
   await page.evaluate(()=>window.__info.close());
   await expect(page.getByTestId('card-counter-badge')).toHaveCount(3);
   await page.screenshot({path:folder+'/'+width+'-observer.png'});
   await page.evaluate(()=>window.__round4.packet([53,22,98,154,0,1,4,2,1,8]));
   await expect(page.getByTestId('card-counter-badge')).toHaveCount(0);
   await page.evaluate(()=>window.__info.detail(0));
   await expect(page.getByTestId('related-card-details').locator('button')).toHaveCount(1);
   await page.evaluate(()=>window.__info.close());
   await page.evaluate(()=>window.__round4.packet([53,22,98,154,0,1,4,2,8,1]));
   await page.evaluate(()=>window.__info.detail(0));
   await expect(page.getByTestId('related-card-details').locator('button')).toHaveCount(1);
   await page.evaluate(()=>window.__info.close());
   await page.evaluate(()=>{
    const fig=window.__round4.card(18489208,4,0);
    window.__followup.stores.cardStore.inner.push(fig);
    window.__round4.packet([96,0,16,0,1,1,8,2,8]);
    window.__info.detail(window.__followup.stores.cardStore.inner.length-1);
   });
   await expect(page.getByTestId('related-card-details').locator('button')).toHaveCount(1);
   await page.evaluate(()=>{
    const bytes=new Uint8Array(17);bytes[0]=50;new DataView(bytes.buffer).setUint32(1,18489208,true);bytes.set([0,16,0,1,0,32,0,1],5);
    window.__round4.packet([...bytes]);
   });
   await expect(page.getByTestId('related-card-details')).not.toBeVisible();
   await page.evaluate(()=>window.__info.close());
   await page.evaluate(()=>window.__info.practice());
   await expect(page.getByTestId('card-counter-badge')).toHaveCount(3);
   await expect(page.locator('#practice-fixture-details').getByTestId('related-card-details').locator('button')).toHaveCount(1);
   await expect(page.locator('#practice-fixture-details').getByTestId('card-counter-detail')).toHaveCount(3);
   const practice=page.locator('[data-testid=practice-card][data-player="1"][data-location="4"]').first();
   await practice.hover();
   await expect(page.getByTestId('card-link-line')).toHaveCount(1);
   await page.screenshot({path:folder+'/'+width+'-practice.png'});
   assert.deepEqual(errors,[]);
   report.push({width,height,geometry,errors});
  } catch(error) {await page.screenshot({path:folder+'/'+width+'-failure.png'});throw error;} finally {await page.close();}
 }
 writeFileSync(folder+'/report.json',JSON.stringify(report,null,2));
 console.log('PASS card links, details/hidden identities, per-type counters, defense and zero response side effects: four viewports');
} finally {await browser?.close();await server?.httpServer.close();}
