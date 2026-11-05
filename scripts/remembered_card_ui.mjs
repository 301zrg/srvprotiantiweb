// Synthetic fixture, no game server. A player's view of an opponent's card that
// was revealed before and is face-down again, next to one never seen.
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/remembered-card-ui";
const outDir = `${folder}/web-dist`;
const seen = 44508094;
const fixtureCode = `
import { initUIContainer as initFixture } from "@/container/compat";
import { roomStore as roomFixture, matStore as matFixture, cardStore as cardFixture, RoomStage as RoomFixtureStage } from "@/stores";
import { fetchCard as fixtureCard, ygopro as fixtureProtocol } from "@/api";
import { displaySimpleSelectCardsModal as fixtureSelect } from "@/ui/Duel/Message/SimpleSelectCardsModal";
const { MZONE } = fixtureProtocol.CardZone;
const { FACEDOWN_DEFENSE } = fixtureProtocol.CardPosition;
const makeCard = (controller, sequence, code) => ({uuid: "remembered-" + controller + "-" + sequence, code, meta: fixtureCard(code), location: new fixtureProtocol.CardLocation({controller, zone: MZONE, sequence, position: FACEDOWN_DEFENSE}), idleInteractivities: [], counters: {}, isToken: false, targeted: false, status: 0, selectInfo: {selectable: false, selected: false}});
window.__rememberedTest = {
  duel() {
    initFixture({signal: new AbortController().signal, ws: {readyState: 1, send() {}}, cancelled: false, isClosed: false, close() {}});
    roomFixture.reset(); roomFixture.joined = true; roomFixture.stage = RoomFixtureStage.DUEL_START;
    matFixture.initInfo.me.life = 8000; matFixture.initInfo.op.life = 8000;
    matFixture.selfType = 1; matFixture.currentPlayer = 0;
    cardFixture.inner = [makeCard(1, 0, ${seen}), makeCard(1, 1, 0), makeCard(0, 2, 69247929)];
    location.hash = "#/duel";
  },
  select() {
    void fixtureSelect({selectables: cardFixture.inner.slice(0, 2).map((card, response) => ({meta: card.meta, location: card.location, response}))});
  },
};
`;

let browser, server;
try {
  mkdirSync(folder, { recursive: true });
  await build({
    logLevel: "warn",
    build: { outDir },
    plugins: [
      {
        name: "remembered-card-test-only",
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
  for (const [name, viewport, mobile] of [
    ["desktop", { width: 1280, height: 800 }, false],
    ["portrait", { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({
      viewport,
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
      timeout: 60000,
    });
    await page.evaluate(() => window.__rememberedTest.duel());

    const at = (controller, sequence) =>
      page.locator(
        `[data-testid="duel-card"][data-card-controller="${controller}"][data-card-sequence="${sequence}"][data-card-zone="MZONE"]`,
      );
    // Only the opponent's card seen before gets the mark: not the unseen one,
    // and not one's own set card, which its owner simply knows.
    await expect(at(1, 0)).toHaveAttribute("data-card-remembered", "true");
    await expect(at(1, 1)).toHaveAttribute("data-card-remembered", "false");
    await expect(at(0, 2)).toHaveAttribute("data-card-remembered", "false");

    // The note comes first: a short phone panel must not scroll it away.
    if (mobile) await at(1, 0).tap();
    else await at(1, 0).click();
    const panel = page.getByTestId("duel-card-panel");
    const note = panel.getByTestId("duel-card-remembered");
    await expect(note).toBeInViewport();
    await expect(note).toContainText("非公开");
    await expect(page.getByTestId("duel-card-detail")).toHaveAttribute(
      "data-card-code",
      String(seen),
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${folder}/${name}-detail.png` });
    await page.getByTestId("duel-card-panel-close").click();
    await expect(panel).toBeHidden();

    // A card never seen still shows nothing.
    if (mobile) await at(1, 1).tap();
    else await at(1, 1).click();
    await expect(panel).toBeVisible();
    await expect(note).toHaveCount(0);
    await expect(page.getByTestId("duel-card-detail")).toHaveAttribute(
      "data-card-code",
      "0",
    );
    await page.getByTestId("duel-card-panel-close").click();
    await expect(panel).toBeHidden();

    // Selecting: a back with the name beside it; the unseen one has no name.
    await page.evaluate(() => window.__rememberedTest.select());
    const options = page.locator(
      '[data-testid="duel-select-card-option"]:visible',
    );
    await expect(options).toHaveCount(2);
    // Both keep their back; options sort by place, so find them by response.
    await expect(options.nth(0)).toHaveAttribute("data-card-code", "0");
    await expect(options.nth(1)).toHaveAttribute("data-card-code", "0");
    const named = options.filter({
      has: page.getByTestId("duel-selection-remembered"),
    });
    await expect(named).toHaveCount(1);
    await expect(named).toHaveAttribute("data-card-response", "0");
    await expect(named).toContainText("曾公开");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS remembered card ${name}: mark, note, unseen card, select`);
  }
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
