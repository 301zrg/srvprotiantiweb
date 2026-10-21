import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {build,preview} from 'vite';
const folder='.audit-tmp/client-chain-timing-ui',outDir=folder+'/web';mkdirSync(folder,{recursive:true});
const base=readFileSync('scripts/client_followup_ui.mjs','utf8').match(/const fixture=`([\s\S]*?)`;\r?\nlet browser/)[1];
const prior=readFileSync('scripts/client_round4_ui.mjs','utf8').match(/const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/)[1];
const fixture=base+prior+`
window.__chainTest={
 empty(mode=0){stores.matStore.chainSetting=mode;window.__followup.sent.length=0;const bytes=new Uint8Array(13);bytes[0]=16;new DataView(bytes.buffer).setUint32(4,0x40,true);window.__round4.packet([...bytes]);},
 event(id){const b=new Uint8Array(7);b.set([2,1,0]);new DataView(b.buffer).setUint32(3,id,true);return window.__round4.packet([...b]);},
 cards(){const b=new Uint8Array(14);b.set([15,0,0,0,1,1]);new DataView(b.buffer).setUint32(6,26202165,true);b.set([0,4,2,1],10);return window.__round4.packet([...b]);},
 result(id){const b=new Uint8Array(7);b.set([2,4,0]);new DataView(b.buffer).setUint32(3,id,true);return window.__round4.packet([...b]);},
 phase(value){return window.__round4.packet([41,value&255,value>>>8]);}
};`;
let browser,server;
try {
 if(!process.argv.includes('--built')){await build({logLevel:'error',build:{outDir},plugins:[{name:'chain-test-only',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});}
 server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const [width,height] of [[1440,900],[844,390],[390,844],[320,640]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});await page.addInitScript(()=>localStorage.setItem('language','cn'));
  try {
   await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});await page.evaluate(()=>window.__round4.online());
   await page.evaluate(()=>window.__chainTest.empty());await page.waitForTimeout(300);
   const sent=await page.evaluate(()=>window.__followup.sent);
   if(process.argv.includes('--capture-before')){assert.equal(sent.length,1,'Before fix All incorrectly skips empty chain');console.log('RED reproduced All skipped empty chain',sent);break;}
   assert.equal(sent.length,0,'All must wait for the user even without candidates');
   await expect(page.locator('[data-testid=duel-select-cards-modal]:visible')).toContainText('\u6b64\u65f6\u6ca1\u6709\u53ef\u4ee5\u53d1\u52a8\u7684\u6548\u679c');
   await expect(page.locator('.ant-modal-title:visible')).toContainText('\u602a\u517d\u53ec\u5524\u6210\u529f');
   await page.getByTestId('duel-chain-inspect').click();await expect(page.getByTestId('duel-chain-continue')).toBeVisible();assert.equal(await page.evaluate(()=>window.__followup.sent.length),0);
   await page.waitForTimeout(400);
   if(width<height){const mini=await page.locator('.ant-modal:visible').boundingBox(),board=await page.getByTestId('duel-board-viewport').boundingBox(),menu=await page.getByTestId('duel-menu').boundingBox();assert.ok(mini.y+mini.height<=board.y+1,'Minimized query owns space above the field');assert.ok(mini.y+mini.height<menu.y,'History and actions remain clear');}
   await page.getByTestId('duel-chain-continue').click();await expect.poll(()=>page.evaluate(()=>window.__followup.sent.length)).toBe(1);assert.deepEqual(await page.evaluate(()=>window.__followup.sent[0]),[5,0,1,255,255,255,255]);
   await page.evaluate(()=>window.__chainTest.cards());await expect(page.locator('[data-testid=duel-select-cards-modal]:visible')).toHaveAttribute('data-select-is-chain','false');await page.locator('[data-testid=duel-select-card-submit]:visible').click();await expect.poll(()=>page.evaluate(()=>window.__followup.sent.length)).toBe(2);assert.deepEqual(await page.evaluate(()=>window.__followup.sent[1]),[2,0,1,0]);
   for(const mode of [1,2]){await page.evaluate(mode=>window.__chainTest.empty(mode),mode);await expect.poll(()=>page.evaluate(()=>window.__followup.sent.length)).toBe(1);}
   await page.evaluate(()=>window.__chainTest.phase(8));await expect(page.getByTestId('duel-phase-select')).toContainText('\u6218\u6597\u9636\u6bb5\u5f00\u59cb');
   for(const [id,part] of [[24,'\u6218\u6597\u9636\u6bb5\u4e2d'],[40,'\u4f24\u5bb3\u6b65\u9aa4\u5f00\u59cb\u65f6'],[41,'\u4f24\u5bb3\u8ba1\u7b97\u524d'],[42,'\u4f24\u5bb3\u8ba1\u7b97\u65f6'],[43,'\u4f24\u5bb3\u8ba1\u7b97\u540e'],[44,'\u4f24\u5bb3\u6b65\u9aa4\u7ed3\u675f\u65f6'],[24,'\u6218\u6597\u9636\u6bb5\u4e2d']]){await page.evaluate(id=>window.__chainTest.event(id),id);await expect(page.getByTestId('duel-phase-select')).toContainText(part);if(width>height)await expect(page.getByTestId('duel-turn-status')).toContainText(part);}
   await page.evaluate(()=>window.__round4.packet([113]));await expect(page.getByTestId('duel-phase-select')).toContainText('\u4f24\u5bb3\u6b65\u9aa4\u5f00\u59cb\u65f6');await page.evaluate(()=>window.__round4.packet([114]));await expect(page.getByTestId('duel-phase-select')).toContainText('\u6218\u6597\u9636\u6bb5\u4e2d');
   await page.evaluate(()=>window.__chainTest.phase(256));await expect(page.getByTestId('duel-phase-select')).not.toContainText('\u4f24\u5bb3');
   await page.evaluate(()=>window.__chainTest.result(70));await expect(page.getByTestId('duel-feedback')).toContainText('\u602a\u517d');
   await page.screenshot({path:folder+'/'+width+'.png'});console.log('PASS empty chain inspection, timing context and battle steps, declaration feedback',width,height);
  }finally{await page.close();}
 }
}finally{await browser?.close();await server?.httpServer.close();}

