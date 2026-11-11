// Local rendering of real attack messages. No live duel or player data.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const exercise = (m) => {
  const {
    React,
    createRoot,
    I18NProvider,
    Mat,
    PracticeBoard,
    FieldBoard,
    cardStore,
    matStore,
    initUIContainer,
    getUIContainer,
    ygopro,
    handle,
    seedScene,
    sceneSteps,
    REVEAL_ALL,
  } = m;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;inset:0;background:#192132;z-index:9999;display:flex;flex-direction:column;--practice-rail:0px";
  document.body.append(host);
  let root, connection;
  const noop = () => {};
  const card = (player, sequence) => ({
    player,
    sequence,
    location: 4,
    position: 1,
    code: 46986414,
    type: 33,
    attack: 2500,
    defense: 2100,
    level: 7,
    rank: 0,
    overlay: [],
    counters: [],
  });
  const cards = [card(0, 1), card(1, 1)];
  const frame = {
    names: ["A", "B"],
    lp: [8000, 8000],
    turn: 2,
    phase: 128,
    turnPlayer: 0,
    step: 0,
    consumed: 0,
    total: 1,
    events: [],
    cards,
  };
  const attackBytes = (direct, player) => [
    110,
    player,
    4,
    1,
    1,
    ...(direct ? [0, 0, 0, 0] : [1 - player, 4, 1, 1]),
  ];
  window.attackFixture = {
    show(mode, direct = false, view = 0, player = 0) {
      connection?.abort();
      root?.unmount();
      root = createRoot(host);
      connection = new AbortController();
      initUIContainer({
        signal: connection.signal,
        get cancelled() {
          return connection.signal.aborted;
        },
        ws: { readyState: 1, send: noop },
      });
      const online = mode === "duel" || mode === "spectator";
      host.className = mode === "practice" ? "practice-session" : "replay-duel";
      if (online) {
        matStore.selfType =
          mode === "spectator"
            ? ygopro.StocGameMessage.MsgStart.PlayerType.Observer
            : view + 1;
        matStore.observerView = view;
        cardStore.reset();
        for (const c of cards)
          cardStore.inner.push({
            uuid: `attack-${c.player}`,
            code: c.code,
            meta: { id: c.code, data: {}, text: { name: "Dark Magician" } },
            location: new ygopro.CardLocation({
              controller: c.player,
              zone: ygopro.CardZone.MZONE,
              sequence: c.sequence,
              position: ygopro.CardPosition.FACEUP_ATTACK,
            }),
            counters: {},
            idleInteractivities: [],
            isToken: false,
            targeted: false,
            selectInfo: { selectable: false, selected: false },
            status: 0,
          });
      }
      const scene = sceneSteps(seedScene(frame), {
        ...frame,
        step: 1,
        events: [attackBytes(direct, player)],
      })[0];
      const element = online
        ? React.createElement(Mat)
        : mode === "practice"
        ? React.createElement(PracticeBoard, {
            frame: scene,
            language: "en",
            disabled: false,
            selected: [],
            onToggle: noop,
            onChoose: noop,
            onInspect: noop,
          })
        : React.createElement(FieldBoard, {
            frame: scene,
            view,
            reveal: REVEAL_ALL,
            language: "en",
            text: [],
            zoom: 1,
            onInspect: noop,
            onPause: noop,
          });
      root.render(React.createElement(I18NProvider, null, element));
      host.dataset.mode = mode;
    },
    attack(direct = false, player = 0) {
      const bytes = Uint8Array.from([0, 0, 1, ...attackBytes(direct, player)]);
      new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
      window.attackPending = handle(getUIContainer(), { data: bytes.buffer });
    },
    cancel() {
      connection.abort();
    },
    pause(hidden) {
      Object.defineProperty(document, "hidden", {
        value: hidden,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    },
    async settled() {
      await window.attackPending;
    },
  };
};

let server, browser;
try {
  server = await createServer({
    server: { host: "127.0.0.1", port: 0 },
    plugins: [
      {
        name: "attack-fixture",
        enforce: "pre",
        transform(code, id) {
          if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
          return (
            code +
            `
        import * as React from "react";
        import { createRoot } from "react-dom/client";
        import { I18NProvider } from "@/ui/I18N";
        import { Mat } from "@/ui/Duel/PlayMat/Mat";
        import { PracticeBoard } from "@/ui/Practice/Board";
        import { FieldBoard } from "@/ui/Replay/FieldBoard";
        import { cardStore, matStore } from "@/stores";
        import { initUIContainer, getUIContainer } from "@/container/compat";
        import { ygopro } from "@/api";
        import handle from "@/service/onSocketMessage";
        import { seedScene, sceneSteps } from "@/ui/Shared/DuelBoard/scene";
        import { REVEAL_ALL } from "@/ui/Shared/DuelBoard/cardState";
        import "@/ui/Practice/style.css";
        import "@/ui/Replay/style.css";
        (${exercise.toString()})({ React, createRoot, I18NProvider, Mat,
          PracticeBoard, FieldBoard, cardStore, matStore, initUIContainer,
          getUIContainer, ygopro, handle, seedScene, sceneSteps, REVEAL_ALL });`
          );
        },
      },
    ],
  });
  await server.listen();
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  await mkdir(".audit-tmp/attack-arrows", { recursive: true });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.abort(),
    );
    await page.goto(origin + "#/replays");
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 120000,
    });
    for (const mode of ["practice", "replay", "duel", "spectator"]) {
      for (const view of mode === "practice" ? [0] : [0, 1]) {
        for (const player of [0, 1])
          for (const direct of [false, true]) {
            await page.evaluate(
              (args) => window.attackFixture.show(...args),
              [mode, direct, view, player],
            );
            if (mode === "duel" || mode === "spectator") {
              await expect(
                page.locator('[data-card-uuid="attack-0"]'),
              ).toBeVisible();
              await page.waitForTimeout(450);
              await page.evaluate(
                (args) => window.attackFixture.attack(...args),
                [direct, player],
              );
            }
            const arrow = page.getByTestId("attack-arrow");
            await expect(arrow).toHaveCount(1);
            await expect(arrow).toHaveAttribute("data-direct", String(direct));
            const viewportBox = await arrow.boundingBox();
            assert.ok(
              viewportBox?.width > 0 && viewportBox?.height > 0,
              `${mode}: SVG must have a nonzero viewport to paint`,
            );
            const points = await arrow.locator("line").evaluate((el) => ({
              y1: Number(el.getAttribute("y1")),
              y2: Number(el.getAttribute("y2")),
              stroke: parseFloat(getComputedStyle(el).strokeWidth),
              pointer: getComputedStyle(el.closest("svg")).pointerEvents,
            }));
            assert.ok(
              points.y1 * points.y2 < 0,
              `${mode}: crosses to opponent`,
            );
            assert.ok(
              Math.abs(points.y2) > (direct ? Math.abs(points.y1) + 80 : 0),
            );
            assert.ok(points.stroke >= (direct ? 12 : 8));
            assert.equal(points.pointer, "none");
            const online = mode === "duel" || mode === "spectator";
            if (online)
              await page.evaluate(() => window.attackFixture.pause(true));
            const targetCard = page.locator(
              online
                ? `[data-card-uuid="attack-${1 - player}"]`
                : `${
                    mode === "practice"
                      ? '[data-testid="practice-card"]'
                      : ".replay-field-card"
                  }[data-player="${1 - player}"][data-location="4"]`,
            );
            const cardBox = await targetCard.boundingBox();
            assert.ok(
              cardBox?.height > 20,
              `${mode}: board has a visible layout`,
            );
            if (!direct) {
              const end = await arrow.locator("line").evaluate((el) => {
                const p = new DOMPoint(
                  Number(el.getAttribute("x2")),
                  Number(el.getAttribute("y2")),
                ).matrixTransform(el.ownerSVGElement.getScreenCTM());
                return { x: p.x, y: p.y };
              });
              assert.ok(
                Math.abs(end.x - (cardBox.x + cardBox.width / 2)) < 3 &&
                  Math.abs(end.y - (cardBox.y + cardBox.height / 2)) < 3,
                `${mode}: arrow must point at the actual target center`,
              );
            }
            if (
              mode === "duel" &&
              view === 0 &&
              player === 0 &&
              !direct &&
              viewport.width > 1000
            ) {
              const before = await arrow.locator("line").getAttribute("y1");
              await page.setViewportSize({ width: 1100, height: 550 });
              await expect(arrow.locator("line")).not.toHaveAttribute(
                "y1",
                before,
              );
              await page.setViewportSize(viewport);
            }
            if (view === 0 && player === 0 && direct)
              await page.screenshot({
                path: `.audit-tmp/attack-arrows/${mode}-${viewport.width}.png`,
              });
            if (online)
              await page.evaluate(() => window.attackFixture.pause(false));
            if (mode === "duel" || mode === "spectator") {
              if (direct)
                await page.evaluate(() => window.attackFixture.cancel());
              await page.evaluate(() => window.attackFixture.settled());
              await expect(arrow).toHaveCount(0);
            }
          }
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS attack arrows ${viewport.width}x${viewport.height}: four modes, both players/views, direct target, completion/cancel cleanup`,
    );
    await page.close();
  }
} finally {
  await browser?.close();
  await server?.close();
}
