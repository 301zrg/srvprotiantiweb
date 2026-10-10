// Synthetic touch fixtures: no production socket, credentials, or player decks.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const before = process.argv.includes("--capture-before");
const folder = `.audit-tmp/mobile-duel-ui/${before ? "before" : "after"}`;
const outDir = `${folder}/web-dist`;
const fixtureCode = `
import { initUIContainer as initFixture } from "@/container/compat";
import { roomStore as roomFixture, matStore as matFixture, cardStore as cardFixture, RoomStage as RoomFixtureStage, InteractType as FixtureInteract } from "@/stores";
import { fetchCard as fixtureCard, ygopro as fixtureProtocol } from "@/api";
import { showCardModal as fixtureDetail } from "@/ui/Duel/Message/CardModal";
import { displayCardListModal as fixtureList } from "@/ui/Duel/Message/CardListModal";
import { displaySimpleSelectCardsModal as fixtureSelect } from "@/ui/Duel/Message/SimpleSelectCardsModal";
import { displaySelectActionsModal as fixtureMulti } from "@/ui/Duel/Message/SelectActionsModal";
window.__mobileTest = {
  lobby(mode = 0) {
    window.__mobilePackets = [];
    initFixture({ws:{readyState:1,send(payload){
      const packet = Array.from(new Uint8Array(payload));
      window.__mobilePackets.push(packet);
      if ([2,34,35].includes(packet[2])) setTimeout(() => {
        roomFixture.players[0].state = packet[2] === 35 ? fixtureProtocol.StocHsPlayerChange.State.NO_READY : fixtureProtocol.StocHsPlayerChange.State.READY;
      }, 30);
    }},cancelled:false,isClosed:false,close(){this.isClosed=true;}});
    roomFixture.reset(); roomFixture.joined = true; roomFixture.isHost = true;
    roomFixture.selfType = fixtureProtocol.StocTypeChange.SelfType.PLAYER1;
    roomFixture.stage = RoomFixtureStage.WAITING;
    roomFixture.hostInfo = {mode,lflist:0x73ec4051,rule:0,duelRule:2,startLp:8000,startHand:5,drawCount:1,timeLimit:180,noCheckDeck:false,noShuffleDeck:false};
    roomFixture.players = [{name:"Touch fixture",state:fixtureProtocol.StocHsPlayerChange.State.NO_READY,isMe:true},undefined,undefined,undefined];
    location.hash = "#/waitroom";
  },
  opponentReady() { roomFixture.players[1] = {name:"A long opponent fixture name",state:fixtureProtocol.StocHsPlayerChange.State.READY,isMe:false}; },
  tagReady() { roomFixture.players = Array.from({length:4},(_,i)=>({name:"Tag fixture "+i,state:fixtureProtocol.StocHsPlayerChange.State.READY,isMe:i===0})); },
  duel() {
    matFixture.initInfo.me.life = 8000; matFixture.initInfo.op.life = 8000;
    matFixture.selfType = 1; matFixture.currentPlayer = 0;
    matFixture.phase.currentPhase = fixtureProtocol.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
    const makeCard = (zone,sequence,code) => ({uuid:"touch-"+zone+"-"+sequence,code,meta:fixtureCard(code),location:{controller:0,zone,sequence,position:fixtureProtocol.CardPosition.FACEUP_ATTACK,is_overlay:false},idleInteractivities:zone===fixtureProtocol.CardZone.HAND?[{interactType:FixtureInteract.SUMMON,response:13}]:[],counters:{1:3},isToken:false,targeted:false,status:0,selectInfo:{selectable:false,selected:false}});
    cardFixture.inner = [...Array.from({length:5},(_,i)=>makeCard(fixtureProtocol.CardZone.HAND,i,69247929)),...Array.from({length:15},(_,i)=>makeCard(fixtureProtocol.CardZone.EXTRA,i,44508094))];
    location.hash = "#/duel";
  },
  detail() { fixtureDetail(cardFixture.inner[0]); },
  list() { fixtureList({isZone:true,zone:fixtureProtocol.CardZone.EXTRA,controller:0}); },
  select(count=15) {
    window.__mobileSelected = null;
    void fixtureSelect({selectables:cardFixture.inner.slice(0,count).map((card,response)=>({meta:card.meta,location:{...card.location,zone:fixtureProtocol.CardZone.EXTRA},response}))}).then(cards=>window.__mobileSelected=cards.map(card=>card.response));
  },
  multi() {
    window.__mobilePackets=[];
    void fixtureMulti({min:2,max:2,totalLevels:0,overflow:true,cancelable:true,selectables:cardFixture.inner.slice(0,15).map((card,response)=>({meta:card.meta,location:{...card.location,zone:fixtureProtocol.CardZone.EXTRA},response}))});
  }
};`;
const profiles = [
  { name: "portrait", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
  { name: "small-portrait", width: 320, height: 640 },
  { name: "small-landscape", width: 568, height: 320 },
  { name: "desktop", width: 1280, height: 800 },
];
let browser, server;
const reports = [],
  errors = [];
try {
  mkdirSync(folder, { recursive: true });
  console.log(`Building mobile fixtures: ${outDir}`);
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "warn",
      build: { outDir },
      plugins: [
        {
          name: "mobile-duel-test-only",
          enforce: "pre",
          transform(code, id) {
            if (id.replaceAll("\\", "/").endsWith("/src/main.tsx"))
              return code + fixtureCode;
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
  const origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const profile of profiles) {
    const mobile = profile.name !== "desktop";
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (/\.(jpg|webp|png)(\?|$)/i.test(route.request().url()))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="59" height="86"><rect width="59" height="86" fill="#69562d"/><rect x="4" y="8" width="51" height="42" fill="#536b85"/></svg>',
        });
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const lang of before ? ["zh"] : ["zh", "en", "ja", "ko"]) {
      console.log(`Mobile duel ${profile.name} / ${lang}`);
      await page.goto(`${origin}?lang=${lang}#/`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 45000,
      });
      await page.evaluate(() => window.__mobileTest.lobby());
      await expect(page.getByTestId("waitroom-ready-toggle")).toBeVisible();
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-lobby.png`,
      });
      const lobby = await page
        .getByTestId("waitroom-scroll")
        .evaluate((el) => ({
          height: el.clientHeight,
          scrollHeight: el.scrollHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
      if (!before) {
        assert.ok(lobby.height >= (profile.height < 400 ? 100 : 260));
        assert.equal(lobby.overflow, false);
        assert.deepEqual(await page.evaluate(() => window.__mobilePackets), []);
        await page.getByTestId("waitroom-ready-toggle").click();
        await expect
          .poll(() =>
            page.evaluate(() =>
              window.__mobilePackets.map((packet) => packet[2]),
            ),
          )
          .toEqual([2, 34]);
        await page.evaluate(() => window.__mobileTest.opponentReady());
        await expect(page.getByTestId("waitroom-start")).toBeEnabled();
        await page.getByTestId("waitroom-start").click();
        assert.equal(
          await page.evaluate(() => window.__mobilePackets.at(-1)[2]),
          37,
        );
        if (lang === "zh") {
          await page.evaluate(() => window.__mobileTest.lobby(2));
          await expect(
            page.getByTestId("waitroom-players").locator("[data-player-seat]"),
          ).toHaveCount(4);
          await page.evaluate(() => window.__mobileTest.opponentReady());
          await expect(page.getByTestId("waitroom-start")).toBeDisabled();
          await page.evaluate(() => window.__mobileTest.tagReady());
          await expect(page.getByTestId("waitroom-start")).toBeEnabled();
          await page.screenshot({
            path: `${folder}/${profile.name}-zh-tag.png`,
          });
          await page.evaluate(() => window.__mobileTest.lobby());
        }
      }
      await page.evaluate(() => window.__mobileTest.duel());
      await expect(page.getByTestId("duel-menu")).toBeVisible();
      if (!before && mobile) {
        const packetCount = await page.evaluate(
          () => window.__mobilePackets.length,
        );
        await page
          .locator('[data-testid="duel-card"][data-card-zone="HAND"]')
          .nth(2)
          .tap();
        await expect(page.getByTestId("duel-action-summon")).toBeVisible();
        await page.getByTestId("duel-action-summon").tap();
        assert.equal(
          await page.evaluate(() => window.__mobilePackets.length),
          packetCount + 1,
        );
        assert.deepEqual(
          await page.evaluate(() => window.__mobilePackets.at(-1)),
          [5, 0, 1, 13, 0, 0, 0],
        );
        await page.getByTestId("duel-card-panel-close").tap();
      }
      await page.evaluate(() => window.__mobileTest.detail());
      await expect(page.getByTestId("duel-card-panel-close")).toBeVisible();
      await page.waitForTimeout(400);
      const detail = await page
        .getByTestId("duel-card-panel")
        .evaluate((el) => {
          const r = el
            .closest(".ant-drawer-content-wrapper")
            .getBoundingClientRect();
          return { height: r.height, width: r.width, y: r.y, bottom: r.bottom };
        });
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-detail.png`,
      });
      await page.getByTestId("duel-card-panel-close").click();
      await page.evaluate(() => window.__mobileTest.list());
      await expect(page.getByTestId("duel-card-list")).toBeVisible();
      if (!before) {
        const lastCard = page
          .getByTestId("duel-card-list")
          .locator("button")
          .last();
        await lastCard.scrollIntoViewIfNeeded();
        // Fractional CSS pixels and the drawer's rounded corners can trim <1%.
        await expect(lastCard).toBeInViewport({ ratio: 0.99 });
        if (mobile) await lastCard.tap();
        else await lastCard.click();
        await expect(page.getByTestId("duel-card-detail")).toHaveAttribute(
          "data-card-code",
          "44508094",
        );
        await page.getByTestId("duel-card-panel-close").click();
        await expect(page.getByTestId("duel-card-list")).toBeVisible();
      }
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-list.png`,
      });
      if (!before) await page.getByTestId("duel-card-list-panel-close").click();
      else
        await page
          .locator(
            '.ant-drawer:has([data-testid="duel-card-list"]) .ant-drawer-close',
          )
          .click();
      await expect(page.getByTestId("duel-card-list")).not.toBeVisible();
      await page.evaluate(() => window.__mobileTest.select());
      const options = page.locator(
        '[data-testid="duel-select-card-option"]:visible',
      );
      await expect(options).toHaveCount(15);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-select.png`,
      });
      const option = await options.first().boundingBox();
      if (!before) {
        if (mobile)
          assert.ok(option.width <= 90, `Selection width ${option.width}`);
        if (mobile) {
          await options.last().scrollIntoViewIfNeeded();
          await expect(options.last()).toBeInViewport({ ratio: 0.99 });
          await options.first().locator(".ant-pro-checkcard").tap();
          await expect(page.getByTestId("duel-card-panel")).not.toBeVisible();
          await options.first().getByTestId("duel-select-card-preview").tap();
          await expect(page.getByTestId("duel-card-panel")).toBeVisible();
          assert.equal(await page.evaluate(() => window.__mobileSelected), null);
          await page.getByTestId("duel-card-panel-close").tap();
          await expect(options.first().locator(".ant-pro-checkcard")).toHaveClass(/ant-pro-checkcard-checked/);
        } else {
          await options.first().click();
          await page.getByTestId("duel-card-panel-close").click();
        }
        await page
          .locator('[data-testid="duel-select-card-submit"]:visible')
          .click();
        await expect
          .poll(() => page.evaluate(() => window.__mobileSelected))
          .toEqual([0]);
        await expect(
          page.locator('[data-testid="duel-select-cards-modal"]:visible'),
        ).toHaveCount(0);
        await page.evaluate(() => window.__mobileTest.multi());
        await expect(options).toHaveCount(15);
        const submit = page.locator(
          '[data-testid="duel-select-card-submit"]:visible',
        );
        await expect(submit).toBeDisabled();
        await options.first().locator(".ant-pro-checkcard").click();
        if (!mobile) await page.getByTestId("duel-card-panel-close").click();
        await expect(submit).toBeDisabled();
        if (mobile && lang === "zh") {
          await page.setViewportSize({
            width: profile.height,
            height: profile.width,
          });
          await expect(
            options.first().locator(".ant-pro-checkcard"),
          ).toHaveClass(/ant-pro-checkcard-checked/);
          await page.setViewportSize({
            width: profile.width,
            height: profile.height,
          });
        }
        await options.last().locator(".ant-pro-checkcard").click();
        if (!mobile) await page.getByTestId("duel-card-panel-close").click();
        await expect(submit).toBeEnabled();
        await submit.click();
        assert.deepEqual(await page.evaluate(() => window.__mobilePackets), [
          [4, 0, 1, 2, 0, 14],
        ]);
        if (mobile) {
          const menu = await page.getByTestId("duel-menu").boundingBox();
          assert.ok(
            detail.bottom <= menu.y + 1,
            "Detail overlaps duel toolbar",
          );
          if (profile.height > profile.width)
            assert.ok(detail.height <= profile.height * 0.4);
          const close = page.getByTestId("duel-card-panel-close");
          // The inspector remains in the DOM after closing. Its header is native size.
          assert.ok(
            await close.evaluate(
              (el) => parseFloat(getComputedStyle(el).minHeight) >= 44,
            ),
          );
        }
      }
      reports.push({ profile: profile.name, lang, lobby, detail, option });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${folder}/metrics.json`,
    JSON.stringify(
      {
        passed: true,
        boundary: "Edge touch emulation; real Android/iOS remain unverified",
        reports,
      },
      null,
      2,
    ),
  );
  console.log(`Passed ${reports.length} mobile duel/lobby profiles`);
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
