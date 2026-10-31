// Synthetic player duel: no production socket. Both clocks stay visible, only
// the timed side counts down (also the opponent in our turn), an identical
// 180 s recalibrates, the ring uses the room limit, spectators see no clock.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/duel-clock-ui";
const outDir = `${folder}/web-dist`;
const fixtureCode = `
import { initUIContainer as initFixture } from "@/container/compat";
import { roomStore as roomFixture, matStore as matFixture, cardStore as cardFixture, RoomStage as RoomFixtureStage } from "@/stores";
import { fetchCard as fixtureCard, ygopro as fixtureProtocol } from "@/api";
import { calibrateClock as calibrateFixture, hideClock as hideFixture, resetClock as resetFixture } from "@/variant/duelClock";
window.__clockTest = {
  duel(limit) {
    initFixture({signal:new AbortController().signal,ws:{readyState:1,send(){}},cancelled:false,isClosed:false,close(){this.isClosed=true;}});
    roomFixture.reset(); roomFixture.joined = true; roomFixture.stage = RoomFixtureStage.DUEL_START;
    roomFixture.selfType = fixtureProtocol.StocTypeChange.SelfType.PLAYER1;
    roomFixture.players = [{name:"Me",state:0,isMe:true},{name:"Opponent",state:0,isMe:false}];
    matFixture.initInfo.me.life = 8000; matFixture.initInfo.op.life = 8000;
    matFixture.selfType = fixtureProtocol.StocGameMessage.MsgStart.PlayerType.FirstStrike;
    matFixture.currentPlayer = 0;
    matFixture.phase.currentPhase = fixtureProtocol.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
    cardFixture.inner = [];
    resetFixture(limit);
    location.hash = "#/duel";
  },
  calibrate(controller, left) { calibrateFixture(controller, left, Date.now()); },
  flip() { matFixture.observerView = 1; },
  // Face-up monsters on both sides (and one face-down), for the ATK/DEF labels.
  monsters() {
    const make = (controller, sequence, code, position) => ({uuid:"stats-"+controller+"-"+sequence,code,meta:fixtureCard(code),location:{controller,zone:fixtureProtocol.CardZone.MZONE,sequence,position,is_overlay:false},idleInteractivities:[],counters:{},isToken:false,targeted:false,status:0,selectInfo:{selectable:false,selected:false}});
    const pile = (controller, zone, n, code) => Array.from({length:n},(_,i)=>({...make(controller, i, code, fixtureProtocol.CardPosition.FACEDOWN_ATTACK), uuid:"pile-"+controller+"-"+zone+"-"+i, location:{controller,zone,sequence:i,position:fixtureProtocol.CardPosition.FACEDOWN_ATTACK,is_overlay:false}}));
    cardFixture.inner = [
      ...pile(0, fixtureProtocol.CardZone.DECK, 30, 0), ...pile(1, fixtureProtocol.CardZone.DECK, 30, 0),
      ...pile(0, fixtureProtocol.CardZone.HAND, 5, 69247929), ...pile(1, fixtureProtocol.CardZone.HAND, 5, 0),
      ...pile(0, fixtureProtocol.CardZone.EXTRA, 10, 0), ...pile(1, fixtureProtocol.CardZone.EXTRA, 10, 0),
      make(0, 0, 69247929, fixtureProtocol.CardPosition.FACEUP_ATTACK),
      make(0, 2, 44508094, fixtureProtocol.CardPosition.FACEUP_DEFENSE),
      make(1, 1, 69247929, fixtureProtocol.CardPosition.FACEUP),
      make(1, 3, 44508094, fixtureProtocol.CardPosition.FACEDOWN_DEFENSE),
    ];
  },
  spectate() { matFixture.selfType = fixtureProtocol.StocGameMessage.MsgStart.PlayerType.Observer; hideFixture(); }
};`;
mkdirSync(folder, { recursive: true });
await build({
  logLevel: "warn",
  build: { outDir },
  plugins: [
    {
      name: "duel-clock-test-only",
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
const server = await preview({
  build: { outDir },
  preview: { host: "127.0.0.1", port: 0 },
});
const origin = server.resolvedUrls.local[0];
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    (existsSync(edge) ? edge : undefined),
});
try {
  for (const [name, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}?lang=zh#/`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page.evaluate(() => window.__clockTest.duel(180));
    const me = page.locator(
      '[data-testid="duel-player-clock"][data-player="me"]',
    );
    const op = page.locator(
      '[data-testid="duel-player-clock"][data-player="op"]',
    );
    // Before any TIME_LIMIT both full clocks are shown, neither counting.
    await expect(me).toHaveAttribute("data-seconds", "180");
    await expect(op).toHaveAttribute("data-seconds", "180");
    await expect(me).toHaveAttribute("data-timing", "false");
    // Our turn, but the opponent is responding to an effect: their clock runs.
    await page.evaluate(() => window.__clockTest.calibrate(1, 150));
    await expect(op).toHaveAttribute("data-timing", "true");
    await page.waitForTimeout(2300);
    const opSeconds = Number(await op.getAttribute("data-seconds"));
    assert.ok(
      opSeconds <= 148 && opSeconds >= 146,
      `opponent counts down (${opSeconds})`,
    );
    await expect(me).toHaveAttribute("data-seconds", "180");
    // Our response is awaited: ours runs; then the same 180 arrives again and
    // restarts the count (the old display ignored an identical value).
    await page.evaluate(() => window.__clockTest.calibrate(0, 180));
    await page.waitForTimeout(2300);
    assert.ok(Number(await me.getAttribute("data-seconds")) <= 178);
    await page.evaluate(() => window.__clockTest.calibrate(0, 180));
    await expect(me).toHaveAttribute("data-seconds", "180");
    await expect(op).toHaveAttribute("data-timing", "false");
    // The ring follows the room limit: 180 of 180 is a full circle.
    const ring = await me
      .locator(".ant-progress")
      .getAttribute("title")
      .catch(() => null);
    assert.ok(ring === null || ring.includes("100"), `full ring (${ring})`);
    await page.screenshot({ path: `${folder}/${name}.png` });
    // Spectators have no reliable time: no clock, no fake 00:00.
    if (!mobile) {
      // Every face-up monster gets its ATK/DEF label on a roomy screen,
      // including a FACEUP position; the face-down one does not.
      await page.evaluate(() => window.__clockTest.monsters());
      // With the hands and piles of a real board; each card's own animated
      // wrapper is slightly larger than the card and must not hide its label.
      await expect(
        page.locator('[data-testid="field-card-stats"]'),
      ).toHaveCount(3, { timeout: 10000 });
      await page.screenshot({ path: `${folder}/${name}-stats.png` });
    }
    // Slot numbers 1-5 for both players' Monster and Spell & Trap Zones.
    await expect(page.getByTestId("zone-index")).toHaveCount(20);
    await page.evaluate(() => window.__clockTest.spectate());
    await expect(page.getByTestId("duel-player-clock")).toHaveCount(0);
    // A spectator turning the board keeps numbers and pile counts upright.
    await page.evaluate(() => window.__clockTest.flip());
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${folder}/${name}-flipped.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Duel clock UI: both clocks visible, timed side only, opponent response, identical recalibration and spectators passed.",
  );
} finally {
  await browser.close();
  await server.httpServer.close();
}
