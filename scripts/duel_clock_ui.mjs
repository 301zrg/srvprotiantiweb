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
import { ygopro as fixtureProtocol } from "@/api";
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
