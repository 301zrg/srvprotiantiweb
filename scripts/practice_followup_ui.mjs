import assert from 'node:assert/strict';
import { chromium,expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync,writeFileSync } from 'node:fs';
const server=process.env.SMOKE_URL?undefined:await preview({build:{outDir:process.env.PRACTICE_TEST_DIST||'dist'},preview:{host:'127.0.0.1',port:0}});
const origin=process.env.SMOKE_URL||server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
mkdirSync('.audit-tmp/practice-followup',{recursive:true});
const cases=process.argv.slice(2).length?process.argv.slice(2):['activate','set','inspect','venus','venus-hand','trap'];
try{for(const kind of cases){
 const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{localStorage.setItem('language','cn');window.__trace={frames:[],sent:[],received:[],workers:0};const Native=Worker;window.Worker=class extends Native{constructor(...a){super(...a);this.epoch=++window.__trace.workers;this.addEventListener('message',({data})=>{window.__trace.received.push(data.type);if(data.type==='frame'){window.__trace.lastEpoch=this.epoch;window.__trace.last=data.frame;window.__trace.frames.push({step:data.frame.step,kind:data.frame.pending?.kind,id:data.frame.pending?.id,choices:data.frame.pending?.choices,events:data.frame.events.map(e=>e[0])});}});}postMessage(data,...a){window.__trace.sent.push(data);super.postMessage(data,...a);}};});
 try{
 await page.goto(origin,{waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
 await page.evaluate(kind=>new Promise((resolve,reject)=>{const r=indexedDB.open('decks');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('decks','readwrite');const store=tx.objectStore('decks');store.clear();const main=kind==='venus-hand'?[...Array(3).fill(39552864),...Array(37).fill(64734921)]:kind==='venus'?[...Array(37).fill(64734921),...Array(3).fill(39552864)]:Array(40).fill(kind==='trap'?83968380:98645731);store.put({deckName:'A test',main,extra:[44508094,52687916],side:[]},'A test');if(['venus','venus-hand','trap'].includes(kind))store.put({deckName:'B normal',main:Array(40).fill(26202165),extra:[],side:[]},'B normal');tx.oncomplete=()=>{db.close();resolve();};};}),kind);
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
 await page.goto(origin+'/#/practice',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle',null,{timeout:60000});
 if(kind==='trap'){await page.getByTestId('practice-chain-setting').click();await page.locator('.ant-select-item-option-content:visible').getByText('\u5168\u90e8\u8fde\u9501',{exact:true}).click();}
 if(['venus','venus-hand','trap'].includes(kind)){
   await page.getByTestId('practice-setup').click();await page.locator('.practice-setup .ant-select').nth(1).click();await page.locator('.ant-select-item-option-content:visible').getByText('B normal',{exact:true}).click();if(kind==='venus-hand')await page.locator('.practice-setup input[type=checkbox]').check();await page.getByTestId('practice-start').click();await page.waitForFunction(()=>window.__trace.lastEpoch===2&&window.__trace.last?.pending?.kind==='idle',null,{timeout:30000});
 }
 if(kind==='inspect'){
   for(const player of [0,1])for(const location of [1,64]){
     await page.locator(`[data-testid="practice-pile"][data-player="${player}"][data-location="${location}"]`).click();
     const pile=page.locator('.practice-pile-cards');await expect(pile.locator('[data-testid="practice-card"]')).toHaveCount(location===1?(player===0?34:35):2);
     const actual=await pile.locator('[data-testid="practice-card"]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.sequence)));
     assert.deepEqual(actual,Array.from({length:actual.length},(_,i)=>actual.length-1-i),'Pile is shown top first');
     await page.locator('.ant-modal-close:visible').click();
   }
 }else if(kind==='venus'||kind==='venus-hand'){
   if(kind==='venus-hand')assert.equal(await page.evaluate(()=>window.__trace.last.cards.filter(c=>c.player===0&&c.location===2&&c.code===39552864).length),3,'Deterministic all-hand Venus targets');
   await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"][data-card-code="64734921"]').first().click();await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle'&&window.__trace.last.cards.some(c=>c.player===0&&c.location===4),null,{timeout:10000});
   for(let attempt=1;attempt<=3;attempt++){
     await page.locator('[data-testid="practice-card"][data-player="0"][data-location="4"][data-card-code="64734921"]').click();await page.locator('[data-testid="practice-card-action"][data-action="5"]:visible').click();
     for(let step=0;step<12;step++){
       await page.waitForFunction(()=>window.__trace.last?.pending,null,{timeout:10000});const pending=await page.evaluate(()=>window.__trace.last.pending);
       if(pending.kind==='idle')break;
       if(pending.kind==='cards'){
         if(pending.choices.every(c=>[2,4,8].includes(c.location))){
           const c=pending.choices[0];await page.locator(`.practice-positioned-card[data-player="${c.player}"][data-location="${c.location}"][data-sequence="${c.sequence}"]`).click();await page.getByTestId('practice-board-confirm').click();
         }else{await expect(page.getByTestId('practice-choices')).toBeVisible();await page.getByTestId('practice-choices').locator('button[data-index]').first().click();await page.getByTestId('practice-confirm').click();}
       }
       else if(pending.kind==='place')await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();
       else if(pending.kind==='position')await page.getByTestId('practice-choices').locator('button[data-index]').first().click();
       else if(pending.kind==='chain'&&pending.cancelable)await page.getByTestId('practice-choices').getByTestId('practice-cancel').click();
       else throw Error('Unexpected Venus prompt '+pending.kind);
       await page.waitForFunction(id=>window.__trace.last?.pending?.id!==id,pending.id,{timeout:10000});
     }
     assert.equal(await page.evaluate(()=>window.__trace.last.lp[0]),8000-attempt*500);
     assert.equal(await page.evaluate(()=>window.__trace.last.cards.filter(c=>c.player===0&&c.location===4&&c.code===39552864).length),attempt);
     await expect(page.getByTestId('phase-ep')).toBeEnabled();
   }
 }else if(kind==='trap'){
   await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();await expect(page.locator('[data-testid="practice-card-action"][data-action="4"]:visible')).not.toContainText('1159');await expect(page.locator('[data-testid="practice-card-action"][data-action="4"]:visible')).toHaveText('\u76d6\u653e');await page.locator('[data-testid="practice-card-action"][data-action="4"]:visible').click();await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle',null,{timeout:10000});await page.getByTestId('phase-ep').click();await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='chain'&&window.__trace.last.pending.player===0,null,{timeout:10000});await page.getByTestId('practice-choices').locator('button[data-index]').first().click();await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle'&&window.__trace.last.pending.player===1,null,{timeout:10000});assert.ok(await page.evaluate(()=>window.__trace.last.cards.some(c=>c.player===0&&c.location===16&&c.code===83968380)));
 }else{
   await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
   await page.locator(`[data-testid="practice-card-action"][data-action="${kind==='activate'?5:4}"]:visible`).click();
   if(kind==='set'){
     await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();
     await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle'&&window.__trace.last.cards.some(c=>c.player===0&&c.location===8),null,{timeout:10000});
     await expect(page.getByTestId('phase-ep')).toBeEnabled();
     await page.getByTestId('phase-ep').click();
     await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle'&&window.__trace.last.pending.player===1,null,{timeout:10000});
   }else{
     // A spell activation may ask for its S/T placement before resolving.
     await page.waitForFunction(()=>['place','cards'].includes(window.__trace.last?.pending?.kind),null,{timeout:10000});
     if(await page.evaluate(()=>window.__trace.last.pending.kind==='place'))await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();
     await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='cards',null,{timeout:10000});
     await expect(page.getByTestId('practice-choices')).toBeVisible({timeout:5000});
     await page.getByTestId('practice-choices').locator('button[data-index]').first().click();
     await page.getByTestId('practice-confirm').click();
     await page.waitForFunction(()=>window.__trace.last?.pending?.kind==='idle',null,{timeout:10000});
     assert.ok(await page.evaluate(()=>window.__trace.last.cards.some(c=>c.player===0&&c.location===16&&c.code===98645731)));
     await expect(page.getByTestId('phase-ep')).toBeEnabled();
   }
 }
 await page.getByTestId('practice-history').click();await expect(page.getByTestId('practice-history-content').locator('li')).not.toHaveCount(0);
 const historyCard=page.getByTestId('practice-history-card').first();if(kind!=='inspect'){await expect(historyCard).toBeVisible();const code=await historyCard.getAttribute('data-card-code');await historyCard.click();await expect(page.getByTestId('practice-history-content')).not.toBeVisible();await expect(page.locator('.practice-detail-image')).toBeVisible();assert.ok((await page.locator('.practice-detail-image').getAttribute('src')).includes(code));await page.locator('.ant-drawer-close:visible').click();}else await page.locator('.ant-drawer-close:visible').click();
 await page.screenshot({path:'.audit-tmp/practice-followup/'+kind+'.png'});
 assert.deepEqual(errors,[]);console.log('PASS native spell/set/monster/trap/pile continuation',kind);
 }catch(error){await page.screenshot({path:'.audit-tmp/practice-followup/'+kind+'-failure.png'});throw error;}finally{writeFileSync('.audit-tmp/practice-followup/'+kind+'-trace.json',JSON.stringify({trace:await page.evaluate(()=>window.__trace),errors},null,2));await page.close();}
}}finally{await browser.close();await server?.httpServer.close();}
