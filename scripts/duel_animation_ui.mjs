// Local React lifecycle and ordered native-packet checks; no live duel connection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, expect, webkit } from "@playwright/test";
import { build, preview } from "vite";

const safari = process.argv.includes("--webkit");
const exerciseAnimation = async (modules) => {
  const {
    React,
    createRoot,
    Card,
    eventbus,
    Task,
    initUIContainer,
    getUIContainer,
    cardStore,
    matStore,
    ygopro,
    YesNoModal,
    handle,
  } = modules;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const wait = async (predicate) => {
    const end = performance.now() + 2000;
    while (!predicate()) {
      if (performance.now() > end) throw new Error("lifecycle did not settle");
      await flush();
    }
  };
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const host = document.createElement("div");
  document.body.append(host);
  const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", {
    value: true,
    writable: true,
    configurable: true,
  });
  const visibility = new Set();
  const add = document.addEventListener,
    remove = document.removeEventListener;
  document.addEventListener = function (type, fn, options) {
    if (type === "visibilitychange") visibility.add(fn);
    return add.call(this, type, fn, options);
  };
  document.removeEventListener = function (type, fn, options) {
    if (type === "visibilitychange") visibility.delete(fn);
    return remove.call(this, type, fn, options);
  };
  const register = eventbus.register;
  let registrations = 0,
    totalRegistrations = 0,
    calls = 0,
    root;
  eventbus.register = (task, target, fn) => {
    registrations++;
    totalRegistrations++;
    const off = register(task, target, (...args) => {
      calls++;
      return fn(...args);
    });
    let disposed = false;
    return () => {
      if (!disposed) registrations--;
      disposed = true;
      off();
    };
  };
  const sent = [];
  const connect = () => {
    const controller = new AbortController();
    initUIContainer({
      signal: controller.signal,
      get cancelled() {
        return controller.signal.aborted;
      },
      ws: {
        readyState: 1,
        send: (bytes) => sent.push([...new Uint8Array(bytes)]),
      },
    });
    return controller;
  };
  try {
    for (let cycle = 0; cycle < 8; cycle++) {
      const controller = connect();
      cardStore.reset();
      cardStore.inner.push({
        uuid: `lifecycle-${cycle}`,
        code: 0,
        meta: { id: 0, data: {}, text: {} },
        location: new ygopro.CardLocation({
          controller: 0,
          zone: ygopro.CardZone.DECK,
          sequence: 0,
          position: ygopro.CardPosition.FACEDOWN,
        }),
        counters: {},
        idleInteractivities: [],
        isToken: false,
        targeted: false,
        selectInfo: { selectable: false, selected: false },
        status: 0,
      });
      root = createRoot(host);
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Card, { idx: 0 }),
        ),
      );
      await wait(() => registrations === 3 && visibility.size > 0);
      const pending = eventbus.call(Task.Focus, `lifecycle-${cycle}`);
      await flush();
      if (cycle % 2) controller.abort();
      else {
        root.unmount();
        root = undefined;
      }
      await pending;
      await wait(() => registrations === 0 && visibility.size === 0);
      const before = calls;
      await eventbus.call(Task.Move, `lifecycle-${cycle}`);
      check(calls === before, "an expired card callback ran");
      if (root) {
        root.unmount();
        root = undefined;
      }
      controller.abort();
    }
    check(
      totalRegistrations === 48,
      "StrictMode did not replace each mount's effect",
    );
    // A real player question still blocks later messages until a response.
    document.hidden = false;
    connect();
    matStore.selfType = 1;
    matStore.turnCount = 0;
    root = createRoot(host);
    root.render(React.createElement(YesNoModal));
    const packet = (bytes) => {
      const data = Uint8Array.from([0, 0, 1, ...bytes]);
      new DataView(data.buffer).setUint16(0, data.length - 2, true);
      return { data: data.buffer };
    };
    // MSG_SELECT_YESNO: player + uint32 description; MSG_NEW_TURN: player.
    const question = handle(getUIContainer(), packet([13, 0, 0, 0, 0, 0]));
    const next = handle(getUIContainer(), packet([40, 1]));
    await flush();
    check(
      matStore.turnCount === 0 && sent.length === 0,
      "player input was skipped",
    );
    window.__animationQuestion = {
      question,
      next,
      sent,
      root,
      host,
      getUIContainer,
      matStore,
    };
    root = undefined;
    return { cycles: 8, registrations, visibility: visibility.size };
  } finally {
    if (root) root.unmount();
    eventbus.register = register;
    document.addEventListener = add;
    document.removeEventListener = remove;
    if (originalHidden)
      Object.defineProperty(document, "hidden", originalHidden);
    else delete document.hidden;
  }
};

let vite, browser;
try {
  const outDir = ".audit-tmp/animation-stability/ui-dist";
  if (!process.argv.includes("--built")) {
    console.log("Building local animation UI fixture");
    await build({
      logLevel: "warn",
      // Exercise React's real StrictMode effect replacement, including cleanup.
      define: { "process.env.NODE_ENV": '"development"' },
      build: { outDir },
      plugins: [
        {
          name: "animation-test-fixture",
          enforce: "pre",
          transform(code, id) {
            if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
            return (
              code +
              `
            import AnimationReact from "react";
            import { createRoot as animationRoot } from "react-dom/client";
            import { Card as AnimationCard } from "@/ui/Duel/PlayMat/Card";
            import { eventbus as animationBus, Task as AnimationTask } from "@/infra/eventbus";
            import { initUIContainer as initAnimationContainer, getUIContainer as animationContainer } from "@/container/compat";
            import { cardStore as animationCards, matStore as animationMat } from "@/stores";
            import { ygopro as animationProtocol } from "@/api";
            import { YesNoModal as AnimationQuestion } from "@/ui/Duel/Message/YesNoModal";
            import animationHandle from "@/service/onSocketMessage";
            window.__runAnimationTest = () => (${exerciseAnimation.toString()})({
              React: AnimationReact, createRoot: animationRoot, Card: AnimationCard,
              eventbus: animationBus, Task: AnimationTask,
              initUIContainer: initAnimationContainer, getUIContainer: animationContainer,
              cardStore: animationCards, matStore: animationMat, ygopro: animationProtocol,
              YesNoModal: AnimationQuestion, handle: animationHandle,
            });`
            );
          },
        },
      ],
    });
    execFileSync(process.execPath, ["scripts/copy_assets.mjs", outDir], {
      stdio: "inherit",
    });
  }
  vite = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  const origin = vite.resolvedUrls.local[0];
  console.log(`Animation UI server: ${origin}`);
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    executablePath: safari
      ? undefined
      : process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
        (existsSync(edge) ? edge : undefined),
  });
  console.log("Browser launched");
  for (const [width, height, touch] of [
    [1280, 800, false],
    [390, 844, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
      }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}#/match`, { waitUntil: "commit" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 120000,
    });
    const result = await page.evaluate(() => window.__runAnimationTest());
    assert.deepEqual(result, { cycles: 8, registrations: 0, visibility: 0 });
    await page.getByTestId("duel-yesno-yes").click();
    const interaction = await page.evaluate(async () => {
      const state = window.__animationQuestion;
      await Promise.all([state.question, state.next]);
      const result = { turnCount: state.matStore.turnCount, sent: state.sent };
      state.root.unmount();
      state.host.remove();
      delete window.__animationQuestion;
      return result;
    });
    assert.equal(interaction.turnCount, 1);
    assert.deepEqual(interaction.sent, [[5, 0, 1, 1, 0, 0, 0]]);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${
        safari ? "WebKit" : "Chromium"
      } ${width}x${height}: 8 StrictMode mount/cancel cycles; zero expired handlers/waits; player input preserves packet order`,
    );
    await context.close();
  }
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  if (vite) await new Promise((resolve) => vite.httpServer.close(resolve));
}
