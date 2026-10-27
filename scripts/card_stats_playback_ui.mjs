import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/card-stats-playback-ui",
  outDir = folder + "/web";
mkdirSync(folder, { recursive: true });
const base = readFileSync("scripts/client_followup_ui.mjs", "utf8").match(
  /const fixture=`([\s\S]*?)`;\r?\nlet browser/,
)[1];
const prior = readFileSync("scripts/client_round4_ui.mjs", "utf8").match(
  /const fixture=base\+`([\s\S]*?)`;\r?\nlet browser/,
)[1];
// Public states also asserted against the locked Core by test_card_identity_core.mjs.
const native = {
  monster: {
    code: 89631139,
    currentCode: 46986414,
    player: 0,
    location: 4,
    sequence: 0,
    position: 1,
    type: 33,
    level: 4,
    rank: 0,
    attribute: 32,
    race: 2,
    attack: 2500,
    defense: 2500,
    baseAttack: 1800,
    baseDefense: 2500,
    overlay: [],
    counters: [],
  },
  geminiAfter: {
    code: 69884162,
    currentCode: 89943723,
    player: 0,
    location: 4,
    sequence: 1,
    position: 1,
    type: 2081,
    level: 4,
    rank: 0,
    attribute: 16,
    race: 1,
    attack: 1900,
    defense: 1300,
    baseAttack: 1900,
    baseDefense: 1300,
    overlay: [],
    counters: [],
  },
};
const fixture =
  base +
  prior +
  `
import {showCardModal,closeCardModal} from '@/ui/Duel/Message/CardModal';
import {openSettingPanel} from '@/ui/Setting';
import {setPracticeDeck} from '@/practice/session';
const NativeWorker=window.Worker;
window.Worker=class {
 constructor(...args){
  if(window.__stats.practiceMock){window.__stats.worker=this;return;}
  const w=new NativeWorker(...args);w.addEventListener('message',({data})=>{
   if(data.type==='frame') {window.__stats.lastReplay={step:data.frame.step,end:data.frame.end};if(window.__stats.replayMock)data.frame.cards=structuredClone(window.__stats.nativeCards);}
  });return w;
 }
 postMessage(data){if(data.type==='open')setTimeout(()=>this.emit(),0);}
 emit(){this.onmessage?.({data:{type:'frame',frame:{step:0,consumed:0,total:0,events:[],cards:structuredClone(window.__stats.nativeCards),lp:[8000,8000],names:['A','B'],turn:3,turnPlayer:0,phase:4,ignoredWins:0}}});}
 terminate(){}
};
window.__stats={nativeCards:${JSON.stringify([
    native.monster,
    native.geminiAfter,
  ])},
 online(){window.__followup.duel();const Z=api.ygopro.CardZone;stores.cardStore.inner=this.nativeCards.map((rc,i)=>{const c=window.__round4.card(rc.code,Z.MZONE,i?3:1);c.meta={...c.meta,data:{...c.meta.data},text:{...c.meta.text}};return c;});this.update();},
 async update(atk=2500,def=1600,baseAtk=1800,baseDef=2000){
  const words=[52,0xfff,89631139,0x01040100,46986414,33,4,0,32,2,atk,def,baseAtk,baseDef];words[0]=words.length*4;
  const bytes=new Uint8Array(words.length*4);const view=new DataView(bytes.buffer);words.forEach((n,i)=>view.setInt32(i*4,n,true));
  await window.__round4.packet([7,0,4,1,...bytes]);
 },
 detail(){showCardModal(stores.cardStore.inner[0]);},close(){closeCardModal();},
 printedAtk(){return api.fetchCard(89631139).data.atk;},speed(value){settingStore.replaySpeed=value;},autoplay(value){settingStore.replayAutoPlay=value;},
 side(side){settingStore.controlPanelSide=side;},settings(){openSettingPanel({defaultKey:'messages'});},
 async practice(){this.practiceMock=true;setPracticeDeck({deckName:'public fixture',main:Array(40).fill(89631139),extra:[],side:[]});location.hash='#/practice';},
};`;
let browser, server;
const reports = [];
const rect = (n) => n.getBoundingClientRect().toJSON();
async function details(page, printedAttack = "3000") {
  const table = page.getByTestId("card-stats-details");
  await expect(table).toBeVisible();
  await expect(
    table.locator("[data-stat-row=current] [data-stat=ATK]"),
  ).toContainText("2500");
  await expect(
    table.locator("[data-stat-row=original] [data-stat=ATK]"),
  ).toHaveText("1800");
  await expect(
    table.locator("[data-stat-row=printed] [data-stat=ATK]"),
  ).toHaveText(printedAttack);
  assert.equal(
    await table
      .locator("[data-stat-row=current] [data-stat=ATK] span")
      .evaluate((e) => getComputedStyle(e).color),
    "rgb(255, 255, 0)",
  );
  const identity = page.getByTestId("card-identity-details");
  await expect(identity.locator("[data-identity-row=current]")).toContainText(
    "黑魔术师",
  );
  await expect(identity.locator("[data-identity-row=printed]")).toContainText(
    "青眼白龙",
  );
  await expect(identity.locator("[data-identity-row=current]")).toContainText(
    "4",
  );
  await expect(identity.locator("[data-identity-row=printed]")).toContainText(
    "8",
  );
  await expect(identity.locator("[data-identity-row=current]")).toContainText(
    "魔法师",
  );
  await expect(identity.locator("[data-identity-row=printed]")).toContainText(
    "龙",
  );
  assert.ok(
    await table.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    "Stats fit the detail width",
  );
}
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir },
      plugins: [
        {
          name: "stats-test-only",
          transform(code, id) {
            if (id.replaceAll("\\", "/").endsWith("/src/main.tsx"))
              return code + fixture;
          },
        },
      ],
    });
    execFileSync(process.execPath, ["scripts/copy_assets.mjs", outDir], {
      stdio: "inherit",
    });
  }
  server = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const origin = server.resolvedUrls.local[0];
  for (const [width, height] of [
    [1440, 900],
    [844, 390],
    [390, 844],
    [320, 640],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      hasTouch: width < 1000,
      isMobile: width < 1000,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("language", "cn"));
    try {
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main[data-ready=true]")).toBeVisible({
        timeout: 60000,
      });
      await page.evaluate(() => window.__stats.online());
      await expect(page.getByTestId("duel-board-viewport")).toBeVisible();
      await page.waitForTimeout(700);
      if (width >= 1024)
        await expect(
          page
            .locator(".card-information-layer [data-testid=field-card-stats]")
            .first(),
        ).toBeVisible();
      else
        await expect(
          page.locator(
            ".card-information-layer [data-testid=field-card-stats]",
          ),
        ).toHaveCount(0);
      for (const side of ["left", "right"]) {
        await page.evaluate((side) => window.__stats.side(side), side);
        await page.waitForTimeout(200);
        if (width > height) {
          const rail = await page.getByTestId("duel-sidebar").evaluate(rect),
            board = await page
              .getByTestId("duel-board-viewport")
              .evaluate(rect);
          assert.ok(
            side === "left" ? rail.right <= board.x : rail.x >= board.right,
            "The board leaves space on the selected side",
          );
          await page.evaluate(() => {
            window.__followup.stores.matStore.hint.msg = "Stats fixture";
          });
          await expect(
            page.getByTestId("duel-feedback").locator(".ant-message-notice"),
          ).toBeVisible();
          const feedback = await page
            .getByTestId("duel-feedback")
            .evaluate(rect);
          assert.ok(feedback.x >= rail.x && feedback.right <= rail.right + 1);
        }
        await page.evaluate(() => window.__stats.detail());
        await details(page);
        await expect
          .poll(async () => {
            const r = await page.getByTestId("duel-card-panel").evaluate(rect);
            return r.x >= -1 && r.right <= width + 1;
          })
          .toBe(true);
        await page.waitForTimeout(350);
        if (width > height) {
          const detail = await page
            .getByTestId("duel-card-panel")
            .evaluate(rect);
          assert.ok(
            side === "left" ? detail.x < width / 2 : detail.x > width / 2,
          );
        }
        await page.screenshot({
          path: folder + "/" + width + "-" + side + "-online.png",
        });
        await page.evaluate(() => window.__stats.close());
      }
      await page.evaluate(() => window.__stats.detail());
      await expect(
        page
          .getByTestId("card-stats-details")
          .locator("[data-stat-row=current] [data-stat=DEF] span"),
      ).toHaveAttribute("data-trend", "lower");
      await page.evaluate(() => window.__stats.update(0, 2000, 0, 2000));
      await expect(
        page
          .getByTestId("card-stats-details")
          .locator("[data-stat-row=current] [data-stat=ATK] span"),
      ).toHaveAttribute("data-trend", "equal");
      await page.evaluate(() => window.__stats.update(-2, 2000, -2, 2000));
      await expect(
        page
          .getByTestId("card-stats-details")
          .locator("[data-stat-row=current] [data-stat=ATK]"),
      ).toHaveText("?");
      assert.equal(
        await page.evaluate(() => window.__stats.printedAtk()),
        3000,
        "Native query changes do not mutate printed card data",
      );
      await page.evaluate(() => window.__stats.close());
      // The same side applies to desktop chat and mobile drawers without losing drafts.
      await page.evaluate(() => window.__followup.room());
      await expect(page.getByTestId("waitroom")).toBeVisible();
      for (const side of ["left", "right"]) {
        await page.evaluate((side) => window.__stats.side(side), side);
        if (width >= 1024) {
          const chat = await page
            .getByTestId("waitroom-sidebar")
            .evaluate(rect);
          assert.ok(side === "left" ? chat.x < width / 2 : chat.x > width / 2);
        } else {
          await page.getByTestId("waitroom-chat-toggle").click();
          await expect(page.getByTestId("waitroom-chat-panel")).toBeVisible();
          const wrapper = page
            .getByTestId("waitroom-chat-panel")
            .locator(
              'xpath=ancestor::div[contains(@class,"ant-drawer-content-wrapper")]',
            );
          await expect(wrapper).toHaveCSS(side, "0px");
          await page.getByTestId("waitroom-chat-input").fill("retained draft");
          await page.getByTestId("waitroom-chat-panel-close").click();
        }
      }
      await page.evaluate(() => window.__stats.practice());
      await expect(page.getByTestId("practice-board")).toBeVisible();
      for (const side of ["left", "right"]) {
        await page.evaluate((side) => window.__stats.side(side), side);
        await page.waitForTimeout(200);
        if (width > height) {
          const rail = await page
            .locator(".practice-session-rail")
            .evaluate(rect);
          assert.ok(side === "left" ? rail.x < width / 2 : rail.x > width / 2);
        }
        await page
          .locator(
            '[data-testid=practice-card][data-location="4"][data-sequence="0"]',
          )
          .click();
        await details(page);
        await page.screenshot({
          path: folder + "/" + width + "-" + side + "-practice.png",
        });
        await page.locator(".ant-drawer-open .ant-drawer-close").click();
      }
      assert.deepEqual(errors, []);
      reports.push({ width, height, errors });
    } catch (error) {
      await page.screenshot({ path: folder + "/" + width + "-failure.png" });
      writeFileSync(
        folder + "/" + width + "-diagnostics.json",
        JSON.stringify(
          await page.evaluate(() => ({
            annotations: document.querySelector(".card-information-layer")
              ?.outerHTML,
            details: document.querySelector("[data-testid=duel-card-detail]")
              ?.outerHTML,
          })),
          null,
          2,
        ),
      );
      throw error;
    } finally {
      await page.close();
    }
  }
  // Actual replay worker: automatic first-frame playback, persisted opt-out and pause-preserving speed changes.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("language", "cn"));
  await page.goto(origin + "#/replays");
  await expect(page.locator("main[data-ready=true]")).toBeVisible({
    timeout: 60000,
  });
  await page
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/replay/native-confirm-search.yrp");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(
    page
      .locator(".replay-controls")
      .getByRole("button", { name: "暂停", exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect
    .poll(() => page.evaluate(() => window.__stats.lastReplay?.step ?? 0))
    .toBeGreaterThan(0);
  await page
    .locator(".replay-controls")
    .getByRole("button", { name: "暂停", exact: true })
    .click();
  await page.evaluate(() => window.__stats.speed(4));
  await expect(
    page.locator(".replay-controls .ant-select-selection-item").first(),
  ).toHaveText("4×");
  await page.waitForTimeout(700);
  const pausedStep = await page.evaluate(() => window.__stats.lastReplay.step);
  await page.waitForTimeout(1000);
  assert.equal(
    await page.evaluate(() => window.__stats.lastReplay.step),
    pausedStep,
  );
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await expect(page.locator(".replay-progress")).toContainText("步骤 0");
  await expect(
    page
      .locator(".replay-controls")
      .getByRole("button", { name: "继续播放", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__stats.autoplay(false);
    window.__stats.replayMock = true;
  });
  await page.getByRole("button", { name: "退出播放", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect(page.locator(".replay-progress")).toContainText("步骤 0");
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => window.__stats.lastReplay.step), 0);
  await page
    .locator('.replay-card[data-location="4"][data-sequence="0"]')
    .first()
    .click();
  await details(page);
  await page.screenshot({ path: folder + "/replay-details.png" });
  assert.deepEqual(errors, []);
  await page.close();
  writeFileSync(folder + "/report.json", JSON.stringify(reports, null, 2));
  console.log(
    "PASS native online query + live stats/identity, responsive annotations, left/right ready/duel/practice and real replay preferences",
  );
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
