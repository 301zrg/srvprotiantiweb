import assert from 'node:assert/strict';
import { waitPastEmptyChains } from './practice_empty_chain.mjs';
import { chromium,expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';
const server=process.env.SMOKE_URL?undefined:await preview({build:{outDir:process.env.PRACTICE_TEST_DIST || 'dist'},preview:{host:'127.0.0.1',port:0}});
const origin=process.env.SMOKE_URL||server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
mkdirSync('.audit-tmp/practice-duel-ui',{recursive:true});
try {
  for(const [name,width,height] of [['desktop',1280,800],['portrait',390,844],['narrow',320,640],['landscape',844,390]].filter(([name])=>process.argv.length<=2||process.argv.slice(2).includes(name))){
    const page=await browser.newPage({viewport:{width,height},isMobile:name!=='desktop',hasTouch:name!=='desktop'});
    const waitForState=(predicate,arg=null,options={})=>waitPastEmptyChains(page,predicate,arg,{...options,trace:'__practiceTrace'});
    let sockets=0; const errors=[];
    page.on('websocket',()=>sockets++);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      localStorage.setItem('language','cn');
      window.__practiceTrace={frames:[],workers:[],configs:[],terminated:[]};const Native=window.Worker;
      window.Worker=class extends Native {constructor(...args){super(...args);this.index=window.__practiceTrace.workers.length;window.__practiceTrace.workers.push(this);this.addEventListener('message',({data})=>{if(data.type==='frame'){window.__practiceTrace.lastWorker=this.index;window.__practiceTrace.frames.push(data.frame);window.__practiceTrace.last=data.frame;}});}postMessage(data,...args){if(data.type==='open')window.__practiceTrace.configs.push(data.config);super.postMessage(data,...args);}terminate(){window.__practiceTrace.terminated.push(this.index);super.terminate();}};
    });
    await page.goto(origin,{waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('decks');request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result;const tx=db.transaction('decks','readwrite');const store=tx.objectStore('decks');store.clear();for(const [deckName,code]of [['Practice A',26202165],['Practice B',97268402]])store.put({deckName,main:Array(40).fill(code),extra:[],side:[]},deckName);tx.oncomplete=()=>{db.close();resolve();};};
    }));
    await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
    await page.goto(origin+'/#/practice',{waitUntil:'domcontentloaded'});
    await expect(page.getByTestId('practice-board')).toBeVisible({timeout:45000});
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle',null,{timeout:45000});
    assert.equal(await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').count(),6);
    assert.equal(await page.locator('[data-testid="practice-card"][data-player="1"][data-location="2"]').count(),5);
    await expect(page.getByTestId('phase-bp')).toBeDisabled();
    const initial=await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().boundingBox();
    await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
    await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();
    const place=page.locator('[data-testid="practice-slot"][data-selectable="true"]').first();
    await expect(place).toBeVisible({timeout:15000});await place.click();
    await waitForState(()=>window.__practiceTrace.last?.cards.some(c=>c.player===0&&c.location===4),null,{timeout:15000});
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle',null,{timeout:15000});
    await page.getByTestId('phase-ep').click();
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last?.pending?.player===1,null,{timeout:15000});
    await expect(page.getByTestId('practice-board')).toHaveAttribute('data-fixed-view','0');
    const aHand=await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().boundingBox();
    const bHand=await page.locator('[data-testid="practice-card"][data-player="1"][data-location="2"]').first().boundingBox();
    assert.ok(aHand.y>bHand.y,'View stays fixed when B acts');
    await page.locator('[data-testid="practice-card"][data-player="1"][data-location="2"]').first().click();
    await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();
    await page.locator('[data-testid="practice-slot"][data-selectable="true"][data-player="1"]').first().click();
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last?.cards.some(c=>c.player===1&&c.location===4),null,{timeout:15000});
    await page.getByTestId('phase-bp').click();
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='battle',null,{timeout:15000});
    await page.getByTestId('phase-mp2').click();
    await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.phase===256,null,{timeout:15000});
    await page.screenshot({path:'.audit-tmp/practice-duel-ui/'+name+'-summon.png'});
    await page.getByTestId('practice-setup').click();
    await page.getByRole('spinbutton',{name:'起始手牌'}).fill('4');
    await page.locator('.ant-modal-close:visible').click();
    await page.getByTestId('practice-retry').click();
    await waitForState(()=>window.__practiceTrace.configs.length===2&&window.__practiceTrace.lastWorker===1&&window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.turn===1,null,{timeout:30000});
    assert.equal(await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').count(),6,'Retry retains the original hand size');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__practiceTrace.configs[0].seed)===JSON.stringify(window.__practiceTrace.configs[1].seed)),true);
    await page.getByTestId('practice-redeal').click();
    await waitForState(()=>window.__practiceTrace.configs.length===3&&window.__practiceTrace.lastWorker===2&&window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.cards.filter(c=>c.player===0&&c.location===2).length===5,null,{timeout:30000});
    assert.equal(await page.locator('[data-testid="practice-card"][data-player="1"][data-location="2"]').count(),4,'Redeal uses the edited hand size');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__practiceTrace.configs[0].seed)!==JSON.stringify(window.__practiceTrace.configs[2].seed)),true);
    await page.evaluate(()=>{const trace=window.__practiceTrace;trace.workers[0].dispatchEvent(new MessageEvent('message',{data:{type:'frame',frame:{...trace.last,turn:9999,lp:[1234,5678]}}}));});
    await expect(page.getByTestId('practice-state')).toHaveAttribute('data-lp-a','8000');
    assert.deepEqual(await page.evaluate(()=>window.__practiceTrace.terminated),[0,1]);
    if(name==='desktop'){
      await page.getByTestId('practice-setup').click();
      await page.locator('.ant-select[aria-label="B 方卡组"]').click();
      await page.locator('.ant-select-item-option-content:visible').getByText('Practice B',{exact:true}).click();
      await page.getByTestId('practice-start').click();
      await waitForState(()=>window.__practiceTrace.configs.length===4&&window.__practiceTrace.lastWorker===3&&window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.turn===1,null,{timeout:30000});
      await page.getByTestId('practice-settings').click();
      await page.getByTestId('confirm-operations-setting').check();
      await page.getByTestId('settings-close').click();
      await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
      await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();
      await page.getByTestId('practice-action-cancel').click();
      assert.equal(await page.locator('[data-testid="practice-card"][data-player="0"][data-location="4"]').count(),0);
      await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
      await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();
      await page.getByTestId('practice-action-confirm').click();
      await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();
      await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='chain'&&window.__practiceTrace.last.pending.player===1&&window.__practiceTrace.last.pending.choices.length>0,null,{timeout:15000});
      // Changing mode while an optional prompt is open must advance the real
      // local duel once, without sending a stale or online response.
      await page.locator('.ant-modal-close:visible').click();
      await page.getByTestId('practice-chain-setting').click();
      await page.locator('.ant-select-item-option-content:visible').getByText('忽略连锁',{exact:true}).click();
      await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle',null,{timeout:15000});
      assert.ok(await page.evaluate(()=>window.__practiceTrace.last.cards.some(c=>c.player===1&&c.location===2&&c.code===97268402)));
      await page.getByTestId('practice-chain-setting').click();
      await page.locator('.ant-select-item-option-content:visible').getByText('全部连锁',{exact:true}).click();
      await page.getByTestId('practice-retry').click();
      await waitForState(()=>window.__practiceTrace.configs.length===5&&window.__practiceTrace.lastWorker===4&&window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.turn===1,null,{timeout:30000});
      await page.locator('[data-testid="practice-card"][data-player="0"][data-location="2"]').first().click();
      await page.locator('[data-testid="practice-card-action"][data-action="0"]:visible').click();
      await page.getByTestId('practice-action-confirm').click();
      await page.locator('[data-testid="practice-slot"][data-selectable="true"]').first().click();
      await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='chain'&&window.__practiceTrace.last.pending.player===1&&window.__practiceTrace.last.pending.choices.length>0,null,{timeout:15000});
      await expect(page.getByTestId('practice-active-player')).toContainText('B 方');
      await page.locator('.ant-modal-close:visible').click();
      await page.locator('[data-testid="practice-card"][data-player="1"][data-location="2"]').first().click();
      await page.locator('[data-testid="practice-card-action"]:visible').click();
      await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='cards',null,{timeout:15000});
      await page.locator('[data-testid="practice-card"][data-player="0"][data-location="4"][data-actionable="true"]').click();
      await page.getByTestId('practice-board-confirm').click();
      for(let step=0;step<8;step++){
        await waitForState(()=>window.__practiceTrace.last?.pending,null,{timeout:15000});
        const pending=await page.evaluate(()=>({kind:window.__practiceTrace.last.pending.kind,id:window.__practiceTrace.last.pending.id,player:window.__practiceTrace.last.pending.player,cancelable:window.__practiceTrace.last.pending.cancelable}));
        if(pending.kind==='idle')break;
        if(pending.kind==='cards'){await page.waitForTimeout(100);continue;}
        assert.equal(pending.kind,'chain',JSON.stringify(pending));
        assert.equal(pending.cancelable,true);
        await page.getByTestId('practice-choices').getByTestId('practice-cancel').click();
        await waitForState(id=>window.__practiceTrace.last?.pending?.id!==id,pending.id,{timeout:15000});
      }
      await waitForState(()=>window.__practiceTrace.last?.pending?.kind==='idle'&&window.__practiceTrace.last.cards.some(c=>c.player===1&&c.location===16&&c.code===97268402),null,{timeout:15000});
      console.log('PASS B hand-effect activation and A-field target during A turn; real Effect Veiler cost and resolution');
    }
    assert.equal(sockets,0);assert.deepEqual(errors,[]);
    assert.ok(initial.y>=0&&initial.y+initial.height<=height,'Initial A hand stays in viewport');
    console.log('PASS direct entry, A/B summons and phases, fixed view, retry/redeal options, stale Worker, zero WSS',name);
    await page.close();
  }
}finally{await browser.close();await server?.httpServer.close();}
