// Synthetic spectator fixtures: no production socket, credentials, or player decks.
// The portrait duel menu must keep one row (one height) while spectating, so the
// board, which is sized from --duel-menu-height, does not jump between phases.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const before = process.argv.includes("--capture-before");
const folder = `.audit-tmp/mobile-spectator-menu-ui/${
  before ? "before" : "after"
}`;
const outDir = `${folder}/web-dist`;
const fixtureCode = `
import { initUIContainer as initFixture } from "@/container/compat";
import { roomStore as roomFixture, matStore as matFixture, cardStore as cardFixture, sideStore as sideFixture, chatStore as chatFixture, SideStage as SideFixtureStage, RoomStage as RoomFixtureStage } from "@/stores";
import { settingStore as settingFixture } from "@/stores/settingStore";
import { fetchCard as fixtureCard, ygopro as fixtureProtocol } from "@/api";
const makeCard = (zone,sequence,code) => ({uuid:"spectator-"+zone+"-"+sequence,code,meta:fixtureCard(code),location:{controller:0,zone,sequence,position:fixtureProtocol.CardPosition.FACEUP_ATTACK,is_overlay:false},idleInteractivities:[],counters:{},isToken:false,targeted:false,status:0,selectInfo:{selectable:false,selected:false}});
window.__spectatorTest = {
  duel() {
    initFixture({signal:new AbortController().signal,ws:{readyState:1,send(){}},cancelled:false,isClosed:false,close(){this.isClosed=true;}});
    roomFixture.reset(); roomFixture.joined = true; roomFixture.stage = RoomFixtureStage.DUEL_START;
    roomFixture.selfType = fixtureProtocol.StocTypeChange.SelfType.OBSERVER;
    matFixture.initInfo.me.life = 8000; matFixture.initInfo.op.life = 8000;
    matFixture.selfType = fixtureProtocol.StocGameMessage.MsgStart.PlayerType.Observer; matFixture.currentPlayer = 0;
    matFixture.phase.currentPhase = fixtureProtocol.StocGameMessage.MsgNewPhase.PhaseType.DRAW;
    cardFixture.inner = Array.from({length:5},(_,i)=>makeCard(fixtureProtocol.CardZone.HAND,i,69247929));
    location.hash = "#/duel";
  },
  phase(phase, timing) {
    matFixture.phase.currentPhase = phase;
    matFixture.phase.battleTiming = timing === null ? undefined : timing;
  },
  waiting(on) { sideFixture.stage = on ? SideFixtureStage.WAITING : SideFixtureStage.NONE; },
  // System chat lines (sender 8) and one logged summon for the spectator log.
  chat(text) { chatFixture.sender = 8; chatFixture.message = text; },
  chatOrder(order) { settingFixture.chatOrder = order; }
};`;
const P = {
  DRAW: 1,
  STANDBY: 2,
  MAIN1: 3,
  BATTLE_START: 4,
  BATTLE_STEP: 5,
  DAMAGE: 6,
  DAMAGE_GAL: 7,
  BATTLE: 8,
  MAIN2: 9,
  END: 10,
};
// Battle-phase labels come from the Core's timing hints; keep every one.
const timings = [
  20,
  21,
  23,
  28,
  25,
  26,
  1604,
  1606,
  1608,
  "attack",
  40,
  42,
  24,
];
const states = [
  ...[P.DRAW, P.STANDBY, P.MAIN1, P.MAIN2, P.END].map((phase) => [phase, null]),
  ...[P.BATTLE_START, P.BATTLE_STEP, P.DAMAGE, P.DAMAGE_GAL, P.BATTLE].map(
    (phase) => [phase, null],
  ),
  ...timings.map((timing) => [P.BATTLE_STEP, timing]),
];
const profiles = [
  { name: "320", width: 320, height: 640 },
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "412", width: 412, height: 915 },
  { name: "430", width: 430, height: 932 },
];
let browser, server;
const report = [],
  errors = [];
try {
  mkdirSync(folder, { recursive: true });
  await build({
    logLevel: "warn",
    build: { outDir },
    plugins: [
      {
        name: "mobile-spectator-test-only",
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
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: true,
      hasTouch: true,
    });
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (/\.(jpg|webp|png)(\?|$)/i.test(route.request().url()))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="59" height="86"><rect width="59" height="86" fill="#69562d"/></svg>',
        });
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    for (const lang of ["zh", "en", "ja", "ko"]) {
      await page.goto(`${origin}?lang=${lang}#/`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 45000,
      });
      await page.evaluate(() => window.__spectatorTest.duel());
      const menu = page.getByTestId("duel-menu");
      await expect(menu).toBeVisible();
      await expect(page.getByTestId("duel-switch-view")).toBeVisible();
      const heights = new Map();
      const measure = async (label) => {
        await page.evaluate(
          () =>
            new Promise((done) =>
              requestAnimationFrame(() => requestAnimationFrame(done)),
            ),
        );
        const box = await menu.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            overflow: document.documentElement.scrollWidth > innerWidth,
            rows: new Set(
              Array.from(
                element.querySelectorAll('button[data-testid^="duel-"]'),
              ).map((button) => Math.round(button.getBoundingClientRect().top)),
            ).size,
            notice: (() => {
              const notice = element.querySelector(
                '[data-testid="duel-observer-wait"]',
              );
              if (!notice) return null;
              const r = notice.getBoundingClientRect();
              return {
                width: Math.round(r.width),
                height: Math.round(r.height),
                clipped: notice.scrollHeight > notice.clientHeight + 1,
              };
            })(),
            buttons: Array.from(
              element.querySelectorAll('button[data-testid^="duel-"]'),
            ).map((button) => {
              const r = button.getBoundingClientRect();
              return {
                name: button.getAttribute("aria-label"),
                width: Math.round(r.width),
                height: Math.round(r.height),
              };
            }),
          };
        });
        heights.set(label, box);
        return box;
      };
      for (const [phase, timing] of states) {
        await page.evaluate(
          ([p, t]) => window.__spectatorTest.phase(p, t),
          [phase, timing],
        );
        await measure(`phase-${phase}-${timing}`);
      }
      await page.evaluate(() => window.__spectatorTest.waiting(true));
      await expect(page.getByTestId("duel-observer-wait")).toBeVisible();
      await measure("side-waiting");
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-waiting.png`,
      });
      await page.evaluate(() => window.__spectatorTest.waiting(false));
      await page.evaluate(() => window.__spectatorTest.phase(5, 1606));
      await page.screenshot({
        path: `${folder}/${profile.name}-${lang}-battle.png`,
      });
      const waiting = heights.get("side-waiting");
      heights.delete("side-waiting");
      const values = [...heights.values()];
      const distinct = [...new Set(values.map((value) => value.height))];
      report.push({
        profile: profile.name,
        lang,
        heights: distinct,
        waiting: waiting.height,
        sample: values[0],
      });
      console.log(
        `${profile.name} / ${lang}: menu heights ${distinct.join(
          ", ",
        )}; side waiting ${waiting.height}`,
      );
      if (!before) {
        assert.equal(
          distinct.length,
          1,
          `${profile.name}/${lang} menu height changes: ${JSON.stringify(
            Object.fromEntries([...heights].map(([k, v]) => [k, v.height])),
          )}`,
        );
        // Between games the notice adds one readable row; controls stay on one row.
        assert.equal(
          waiting.rows,
          1,
          `${profile.name}/${lang} waiting controls wrap`,
        );
        assert.ok(
          waiting.notice.width >= profile.width - 40 && !waiting.notice.clipped,
          `${profile.name}/${lang} waiting notice unreadable: ${JSON.stringify(
            waiting.notice,
          )}`,
        );
        assert.ok(
          waiting.height <= distinct[0] + 40,
          `${profile.name}/${lang} waiting notice grows the menu too much`,
        );
        heights.set("side-waiting", waiting);
        for (const [label, value] of heights) {
          assert.equal(
            value.overflow,
            false,
            `${profile.name}/${lang}/${label} overflows the page`,
          );
          assert.ok(
            value.left >= 0 && value.right <= profile.width,
            `${profile.name}/${lang}/${label} leaves the viewport`,
          );
          for (const button of value.buttons)
            assert.ok(
              button.width >= 44 && button.height >= 44,
              `${profile.name}/${lang}/${label} ${button.name} is below the 44px touch target`,
            );
        }
        // Spectator controls keep their accessible names even when shown as icons.
        for (const id of [
          "duel-switch-view",
          "duel-leave-spectating",
          "duel-phase-select",
        ])
          assert.ok(
            (await page.getByTestId(id).getAttribute("aria-label"))?.trim(),
            `${id} lost its label`,
          );
        await page.getByTestId("duel-switch-view").tap();
      }
    }
    if (!before && profile.name === "390") {
      // Duel chat order: oldest first by default (as the action log), newest
      // first when chosen; spectators get the text action log on phones.
      await page.evaluate(() => {
        window.__spectatorTest.chat("first line");
      });
      await page.waitForTimeout(50);
      await page.evaluate(() => window.__spectatorTest.chat("second line"));
      await page.getByTestId("duel-chat").tap();
      const panel = page.getByTestId("duel-chat-panel");
      await expect(panel).toContainText("second line");
      const order = async () =>
        panel.evaluate((el) => {
          const text = el.innerText;
          return text.indexOf("first line") < text.indexOf("second line")
            ? "oldest"
            : "newest";
        });
      assert.equal(
        await order(),
        "oldest",
        "chat follows the oldest-first log by default",
      );
      await page.evaluate(() => window.__spectatorTest.chatOrder("newest"));
      await expect.poll(order).toBe("newest");
      await page.screenshot({ path: `${folder}/390-chat-newest.png` });
      await page.evaluate(() => window.__spectatorTest.chatOrder("history"));
      await expect.poll(order).toBe("oldest");
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${folder}/report.json`, JSON.stringify(report, null, 2));
  console.log(
    `Mobile spectator menu ${
      before ? "capture" : "verification"
    } finished: ${folder}`,
  );
} finally {
  await browser?.close();
  await server?.httpServer?.close();
}
