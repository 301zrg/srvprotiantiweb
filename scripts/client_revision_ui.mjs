import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { build,preview } from 'vite';

const fixture = `
import { initUIContainer,getUIContainer } from '@/container/compat';
import * as stores from '@/stores';
import * as api from '@/api';
import { settingStore } from '@/stores/settingStore';
import { connectionStore } from '@/variant/connection';
import { beginActionRequest, invalidateActionRequest } from '@/service/duel/actionRequest';
import { eventbus, Task } from '@/infra';
import handleEffectRps from '@/service/duel/rockPaperScissors';
window.__revision={stores,api,settingStore,sent:[],
init(){ const trace=this.sent; initUIContainer({ws:{readyState:1,send(data){trace.push(Array.from(new Uint8Array(data.buffer||data)));},addEventListener(){},removeEventListener(){}},signal:new AbortController().signal,close(){}}); stores.resetUniverse(); const {matStore:m,roomStore:r}=stores; m.selfType=1;m.currentPlayer=0;m.turnCount=1;m.phase.currentPhase=3;r.joined=true;r.selfType=1;r.hostInfo={duelRule:2,mode:0,lflist:0x73ec4051,startLp:8000,startHand:5,drawCount:1,timeLimit:180};r.players=[{name:'A',isMe:true,state:1},{name:'B',isMe:false,state:1}];connectionStore.state='connected';settingStore.confirmOperations=false;},
phase(bp,ep,m2=false,battle=false){const m=stores.matStore;beginActionRequest(getUIContainer(),battle?'battle':'idle');m.phase.currentPhase=battle?5:3;m.phase.enableBp=bp;m.phase.enableEp=ep;m.phase.enableM2=m2;},
duel(){this.init();this.phase(false,true);location.hash='#/duel';},
room(){this.init();stores.roomStore.stage=stores.RoomStage.WAITING;location.hash='#/waitroom';},
rps(){stores.roomStore.stage=stores.RoomStage.HAND_SELECTING;eventbus.emit(Task.Mora);},
effectRps(){void handleEffectRps({player:0});},
invalidate(){invalidateActionRequest(getUIContainer());}};`;
let browser,server;
mkdirSync('.audit-tmp/client-revision-ui',{recursive:true});
try {
  const outDir='.audit-tmp/client-revision-ui/web';
  if(!process.argv.includes('--built')){
    await build({logLevel:'error',build:{outDir},plugins:[{name:'revision-test-fixture',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/main.tsx'))return code+fixture;}}]});
    execFileSync(process.execPath,['scripts/copy_assets.mjs',outDir],{stdio:'inherit'});
  }
  server=await preview({build:{outDir},preview:{host:'127.0.0.1',port:0}});
  const origin=server.resolvedUrls.local[0];
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  let page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.addInitScript(()=>localStorage.setItem('language','cn'));
  await page.goto(origin);await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
  await expect(page.getByRole('link',{name:'srvprotiantiweb',exact:true}).locator('..')).toContainText('本项目开源地址位于：');
  await page.evaluate(()=>window.__revision.duel());
  await page.getByTestId('duel-phase-select').click();
  await expect(page.getByTestId('duel-phase-battle')).toHaveClass(/disabled/,{timeout:2500});
  await page.keyboard.press('Escape');
  if(process.argv.includes('--red'))process.exitCode=0;
  else {
    await expect(page.getByTestId('duel-phase-bar').locator('button')).toHaveCount(6);
    await expect(page.getByTestId('phase-bp')).toBeDisabled();
    await expect(page.getByTestId('phase-mp2')).toBeDisabled();
    await expect(page.getByTestId('phase-ep')).toBeEnabled();
    await page.evaluate(()=>window.__revision.phase(true,false));
    await expect(page.getByTestId('phase-bp')).toBeEnabled();
    await expect(page.getByTestId('phase-ep')).toBeDisabled();
    await page.evaluate(()=>window.__revision.stores.matStore.currentPlayer=1);
    await expect(page.getByTestId('duel-phase-bar')).toHaveAttribute('data-turn-owner','opponent');
    await expect(page.getByTestId('duel-phase-bar').locator('button:enabled')).toHaveCount(0);
    await page.evaluate(()=>{window.__revision.stores.matStore.currentPlayer=0;window.__revision.phase(false,true,true,true);});
    await expect(page.getByTestId('phase-mp2')).toBeEnabled();
    await page.evaluate(()=>window.__revision.invalidate());
    await expect(page.getByTestId('duel-phase-bar').locator('button:enabled')).toHaveCount(0);
    await page.evaluate(()=>window.__revision.phase(false,true,true,true));
    await page.getByTestId('phase-mp2').click();
    await expect(page.getByTestId('phase-mp2')).toBeDisabled();
    assert.equal(await page.evaluate(()=>new DataView(new Uint8Array(window.__revision.sent.at(-1).slice(-4)).buffer).getInt32(0,true)),2);
    await page.screenshot({path:'.audit-tmp/client-revision-ui/phase-desktop.png'});
    console.log('PASS phase availability, forced battle, opponent and request invalidation');
    await page.evaluate(()=>window.__revision.settingStore.showZoneCounts=true);
    for(const badge of await page.getByTestId('zone-count-badge').all()) {
      const box=await badge.boundingBox(),parent=await badge.locator('..').boundingBox();
      assert.ok(box.x>=parent.x-1&&box.y>=parent.y-1&&box.x+box.width<=parent.x+parent.width+1&&box.y+box.height<=parent.y+parent.height+1,'Count badge attaches to its own zone');
    }
    await page.evaluate(()=>window.__revision.settingStore.showZoneCounts=false);
    await expect(page.getByTestId('zone-count-badge')).toHaveCount(0);
    await page.locator('[data-testid="duel-zone"][data-zone="DECK"][data-controller="0"]').click();
    await expect(page.getByTestId('duel-card-list')).toHaveAttribute('data-card-count','0');
    await page.getByTestId('duel-card-list-panel-close').click();
    await page.evaluate(()=>{window.__revision.settingStore.randomRpsMode='play';Math.random=()=>0;window.__revision.effectRps();});
    await page.getByTestId('effect-random-rps').click();
    await expect(page.locator('.ant-message')).toContainText('本次已出：石头');
    assert.equal(await page.evaluate(()=>new DataView(new Uint8Array(window.__revision.sent.at(-1).slice(-4)).buffer).getInt32(0,true)),2,'Effect display and actual response both mean rock');
    await page.close();
    page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await page.addInitScript(()=>localStorage.setItem('language','cn'));
    await page.goto(origin,{waitUntil:'domcontentloaded'});await expect(page.locator('main[data-ready="true"]')).toBeVisible({timeout:60000});
    await page.evaluate(()=>window.__revision.room());
    await expect(page.getByTestId('waitroom-settings')).toBeVisible();
    await page.getByTestId('waitroom-settings').click();
    await expect(page.getByTestId('setting-random-rps-play')).toBeVisible();
    await page.getByTestId('settings-close').click();
    for(const [index,[width,height]]of [[390,844],[844,390],[390,844],[320,640]].entries()){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>{window.__revision.settingStore.randomRpsMode='suggest';window.__revision.rps();});
      const random=page.getByTestId('waitroom-random-rps');
      await expect(random).toBeVisible();const box=await random.boundingBox();
      assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'Random RPS fits rotated viewport');
      await random.tap();await expect(page.getByTestId('waitroom-rps-suggestion')).toBeVisible();
      await page.screenshot({path:'.audit-tmp/client-revision-ui/rps-panel-'+width+'-'+height+'.png'});
      await page.getByTestId('rps-settings').click();
      await page.getByTestId('setting-random-rps-play').check();
      await page.getByTestId('settings-close').click();
      const handName=await page.getByTestId('waitroom-mora-'+['rock','scissors','paper'][index%3]).innerText();
      await page.evaluate(index=>{Math.random=()=>index/3;},index%3);
      await random.tap();
      await expect(page.locator('.ant-message')).toContainText('本次已出：'+handName.trim());
      await expect(page.getByTestId('room-rps-panel')).not.toBeVisible();
      const sent=await page.evaluate(()=>window.__revision.sent.at(-1));
      assert.equal(sent.at(-1),[2,1,3][index%3],'Displayed hand matches the actual legacy protocol code');
      await page.screenshot({path:'.audit-tmp/client-revision-ui/rps-'+width+'-'+height+'.png'});
    }
    console.log('PASS attached zone badges/hide and retained modal counts, room settings, RPS suggestion/direct result and portrait rotation');
  }
} finally {await browser?.close();await server?.httpServer.close();}
