import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {chromium,expect} from '@playwright/test';
import {build,preview} from 'vite';
const folder='.audit-tmp/client-target-selection-ui',outDir=folder+'/web';mkdirSync(folder,{recursive:true});
const base=readFileSync('scripts/client_followup_ui.mjs','utf8').match(/const fixture=`([\s\S]*?)`;\r?\nlet browser/)[1];
const prior=readFileSync('scripts/client_round4_ui.mjs','utf8').match(/const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/)[1];
const fixture=base+prior+`
window.__targets={
 setup(){window.__round4.online();const Z=api.ygopro.CardZone;stores.cardStore.inner=stores.cardStore.inner.filter(c=>![Z.MZONE,Z.SZONE].includes(c.location.zone));for(const sequence of [0,2,4]){const c=window.__round4.card(0,Z.SZONE,sequence,1);c.location.position=3;stores.cardStore.inner.push(c);}this.aborter=new AbortController();getUIContainer().conn.signal=this.aborter.signal;window.__followup.sent.length=0;},
 open(){const b=new Uint8Array(30);b.set([15,0,0,1,2,3]);let p=6;for(const sequence of [0,4,2]){p+=4;b.set([1,8,sequence,8],p);p+=4;}return window.__round4.packet([...b]);},
 abort(){this.aborter.abort();},
 next(){return window.__round4.packet([41,4,0]);}
};`;
let browser,server;
const report=[];
try {
 if(!process.argv.includes('--built')){await build({logLevel:'error',build:{outDir},plugins:[{name:'target-test-only',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});}
 server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const [width,height] of [[1280,800],[844,390],[390,844],[320,640]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('language','cn'));
  try {
   await page.goto(server.resolvedUrls.local[0],{waitUntil:'domcontentloaded',timeout:60000});await expect(page.locator('main[data-ready=true]')).toBeVisible({timeout:60000});await page.evaluate(()=>{window.__targets.setup();const known=window.__round4.card(46986414,3,0,1);for(const card of window.__followup.stores.cardStore.inner.filter(c=>c.location.zone===3)){card.code=known.code;card.meta=known.meta;}window.__targets.open();});
   const modal=page.locator('[data-testid=duel-select-cards-modal]:visible');
   await expect(modal.getByTestId('field-selection-grid')).toBeVisible();
   const slots=modal.getByTestId('field-selection-slot');await expect(slots).toHaveCount(5);
   assert.deepEqual(await slots.evaluateAll(es=>es.map(e=>e.querySelector('[data-testid=duel-select-card-option]')?.dataset.cardSequence??null)),['4',null,'2',null,'0'],'Screen position keeps gaps and mirrors the opponent without reordering response IDs');
   const candidate=sequence=>modal.locator('[data-testid=duel-select-card-option][data-card-sequence="'+sequence+'"]');
   for(const sequence of [0,2,4])await expect(candidate(sequence)).toHaveAttribute('data-card-code','0');
   await expect(candidate(2)).toHaveAttribute('aria-label', /\u4ece\u5de6\u7b2c 3 \u683c/);
   await candidate(2).locator('.ant-pro-checkcard').click();await expect(page.locator('[data-testid=duel-card][data-card-controller="1"][data-card-zone="SZONE"][data-card-sequence="2"]')).toHaveAttribute('data-field-selected','true');
   assert.equal(await page.evaluate(()=>window.__followup.sent.length),0,'Selecting remains local until confirmation');
   await candidate(2).getByTestId('duel-select-card-locate').click();await expect(page.getByTestId('duel-field-selection-back')).toBeVisible();await expect(modal).not.toBeVisible();
   const real=page.locator('[data-testid=duel-card][data-card-controller="1"][data-card-zone="SZONE"]');await expect(real).toHaveCount(3);await expect(real.locator('[data-testid=duel-field-marker]')).toHaveCount(3);
   await real.filter({has:page.locator('[data-testid=duel-field-marker][data-slot="5"]')}).click();assert.equal(await page.evaluate(()=>window.__followup.sent.length),0,'Board toggling does not directly answer a multi-card request');
   await page.getByTestId('duel-field-selection-back').click();await expect(modal).toBeVisible();
   await expect(candidate(0)).toHaveAttribute('data-field-selected','true');await expect(candidate(2)).toHaveAttribute('data-field-selected','true');
   if(width===390){await page.setViewportSize({width:844,height:390});await expect(candidate(2)).toHaveAttribute('data-field-selected','true');await page.setViewportSize({width,height});await expect(candidate(0)).toHaveAttribute('data-field-selected','true');}
   await page.screenshot({path:folder+'/'+width+'-selected.png'});
   await page.locator('[data-testid=duel-select-card-submit]:visible').click();await expect.poll(()=>page.evaluate(()=>window.__followup.sent.length)).toBe(1);assert.deepEqual(await page.evaluate(()=>window.__followup.sent[0]),[4,0,1,2,2,0]);
   await expect(real.locator('[data-testid=duel-field-marker]')).toHaveCount(0);
   await page.evaluate(()=>window.__targets.open());await expect(modal.getByTestId('field-selection-grid')).toBeVisible();await page.evaluate(()=>window.__targets.abort());await expect(real.locator('[data-testid=duel-field-marker]')).toHaveCount(0);assert.equal(await page.evaluate(()=>window.__followup.sent.length),1,'Aborting discards pending local selection without sending');
   await page.evaluate(()=>{
    window.__targets.setup();const {stores}=window.__followup;const Z={MZONE:2,SZONE:3};
    for(const c of stores.cardStore.inner.filter(c=>c.location.zone===Z.SZONE)){c.location.zone=Z.MZONE;c.location.position=0;}
    stores.cardStore.inner.push(window.__round4.card(26202165,Z.MZONE,2,1,true,0));
    const b=new Uint8Array(30);b.set([15,0,0,1,2,3]);let p=6;for(const sequence of [0,4,2]){p+=4;b.set([1,4,sequence,1],p);p+=4;}window.__round4.packet([...b]);
   });
   await expect(modal.getByTestId('field-selection-grid')).toBeVisible();await candidate(2).getByTestId('duel-select-card-locate').click();
   const host=page.locator('[data-testid=duel-card][data-card-controller="1"][data-card-zone="MZONE"][data-card-sequence="2"][data-card-is-overlay="false"]');
   await host.getByTestId('duel-material-count').click();await expect(page.getByTestId('duel-card-list')).toBeVisible();await expect(host).toHaveAttribute('data-field-selected','false');await page.getByTestId('duel-card-list-panel-close').click();
   await host.getByTestId('duel-material-count').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('duel-card-list')).toBeVisible();await expect(host).toHaveAttribute('data-field-selected','false');await page.getByTestId('duel-card-list-panel-close').click();
   assert.equal(await page.evaluate(()=>window.__followup.sent.length),0,'Mouse and keyboard material inspection must preserve the draft');
   await page.evaluate(()=>window.__targets.next());await expect(host.getByTestId('duel-field-marker')).toHaveCount(0);
   assert.deepEqual(errors,[]);report.push({width,height,passed:true});console.log('PASS spatial hidden targets, bidirectional selection, exact response indices, rotation and abort cleanup',width,height);
  }catch(e){await page.screenshot({path:folder+'/failure-'+width+'.png'});throw e;}finally{await page.close();}
 }
}finally{await browser?.close();await server?.httpServer.close();writeFileSync(folder+'/report.json',JSON.stringify(report,null,2));}
