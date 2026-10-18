// Synthetic native YGOPro packets; the browser never connects to a game server.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const folder = ".audit-tmp/tribute-selection";
mkdirSync(folder, { recursive: true });
const results = [];
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const twin = { code: 11662742, value: 2 };
const elf = { code: 15025844, value: 1 };
const dragon = { code: 89631139, value: 1 };
const u32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return [...bytes];
};
const cases = [
  {
    name: "twin-alone-hyperion",
    cards: [twin],
    steps: [[0, true]],
    expected: [0],
  },
  {
    name: "ordinary-two-tributes",
    cards: [elf, dragon],
    steps: [
      [0, false],
      [1, true],
    ],
    expected: [0, 1],
  },
  {
    name: "server-disables-double-tribute",
    cards: [{ ...twin, value: 1 }, elf],
    steps: [
      [0, false],
      [1, true],
    ],
    expected: [0, 1],
  },
  {
    name: "preserve-response-index",
    cards: [elf, twin],
    steps: [[1, true]],
    expected: [1],
  },
  {
    name: "weighted-overflow",
    cards: [twin, elf],
    steps: [
      [0, true],
      [1, true],
    ],
    expected: [0, 1],
  },
  {
    name: "maximum-card-count",
    cards: [elf, dragon, twin],
    steps: [
      [0, false],
      [1, true],
      [2, false],
      [2, true],
    ],
    expected: [0, 1],
  },
  {
    name: "one-tribute",
    min: 1,
    max: 1,
    cards: [elf],
    steps: [[0, true]],
    expected: [0],
  },
  { name: "cancel-summon", cancelable: true, cards: [twin], cancel: true },
  {
    name: "ordinary-select-card",
    type: 15,
    cards: [elf, dragon],
    steps: [
      [0, false],
      [1, true],
    ],
    expected: [0, 1],
  },
];

let vite, browser;
try {
  console.log("Starting local tribute selection regression");
  vite = await createServer({
    mode: "production",
    // The fixture never edits source; avoid watching large local runtime copies.
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/*"] } },
  });
  await vite.listen();
  const origin = vite.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [name, width, height, touch] of [
    ["desktop", 1280, 800, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
      }),
    );
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    console.log(`${name}: page loaded`);
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    console.log(`${name}: resources ready`);
    await page.evaluate(async () => {
      const { initUIContainer, getUIContainer } = await import(
        "/src/container/compat.ts"
      );
      const { matStore, roomStore } = await import("/src/stores/index.ts");
      const { default: handle } = await import(
        "/src/service/onSocketMessage.ts"
      );
      window.__tribute = {
        packets: [],
        send: async (type, bytes) => {
          const frame = Uint8Array.from([0, 0, 1, type, ...bytes]);
          new DataView(frame.buffer).setUint16(0, frame.length - 2, true);
          await Promise.race([
            handle(getUIContainer(), { data: frame.buffer }),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(`Timed out handling native message ${type}`),
                  ),
                15000,
              ),
            ),
          ]);
        },
      };
      initUIContainer({
        ws: {
          readyState: 1,
          send(value) {
            window.__tribute.packets.push([...value]);
          },
        },
      });
      matStore.selfType = 1;
      matStore.initInfo.me.life = 8000;
      matStore.initInfo.op.life = 8000;
      roomStore.players = [
        { name: "祭品回归", isMe: true, state: 0 },
        { name: "对手", isMe: false, state: 0 },
      ];
      location.hash = "#/duel";
    });
    await expect(page.getByTestId("duel-menu")).toBeVisible();
    console.log(`${name}: client ready`);
    for (const scenario of cases) {
      console.log(`${name}: checking ${scenario.name}`);
      try {
        // Rebuild the actual field: only candidate tributes, with Hyperion in hand.
        const reload = [2];
        for (let player = 0; player < 2; player++) {
          reload.push(...u32(8000));
          for (let seq = 0; seq < 7; seq++)
            reload.push(
              ...(player === 0 && seq < scenario.cards.length
                ? [1, 1, 0]
                : [0]),
            );
          reload.push(...Array(8).fill(0), 0, player === 0 ? 1 : 0, 0, 0, 0, 0);
        }
        reload.push(0);
        const queries = scenario.cards.map((card, seq) => [
          0,
          4,
          seq,
          ...u32(12),
          ...u32(1),
          ...u32(card.code),
        ]);
        queries.push([0, 2, 0, ...u32(12), ...u32(1), ...u32(55794644)]);
        const bytes = [
          0,
          scenario.cancelable ? 1 : 0,
          scenario.min ?? 2,
          scenario.max ?? 2,
          scenario.cards.length,
          ...scenario.cards.flatMap((card, seq) => [
            ...u32(card.code),
            0,
            4,
            seq,
            scenario.type === 15 ? 1 : card.value,
          ]),
        ];
        await page.evaluate(
          async ({ reload, queries, type, bytes }) => {
            const { send, packets } = window.__tribute;
            packets.length = 0;
            await send(162, reload);
            for (const query of queries) await send(7, query);
            window.__tribute.selection = send(type, bytes);
          },
          { reload, queries, type: scenario.type ?? 20, bytes },
        );
        const modal = page.locator(
          '[data-testid="duel-select-cards-modal"]:visible',
        );
        const submit = page.locator(
          '[data-testid="duel-select-card-submit"]:visible',
        );
        const cancel = page.locator(
          '[data-testid="duel-select-card-cancel"]:visible',
        );
        await expect(modal).toBeVisible();
        await expect(submit).toBeDisabled();
        await expect(modal.getByTestId("duel-select-card-option")).toHaveCount(
          scenario.cards.length,
        );
        await expect(cancel).toHaveCount(scenario.cancelable ? 1 : 0);
        if (scenario.cancel) {
          await cancel.click();
        } else {
          for (const [index, enabled] of scenario.steps) {
            const option = modal
              .getByTestId("duel-select-card-option")
              .nth(index);
            await option.locator(".ant-pro-checkcard").click();
            // Desktop clicks open the details drawer; close it before the next click.
            const close = page.getByTestId("duel-card-panel-close");
            if (await close.isVisible()) await close.click();
            if (enabled) await expect(submit).toBeEnabled();
            else await expect(submit).toBeDisabled();
          }
          if (scenario.name === "twin-alone-hyperion")
            await page.screenshot({ path: `${folder}/${name}-twin-alone.png` });
          await submit.click();
        }
        await expect(modal).toBeHidden();
        await page.evaluate(() => window.__tribute.selection);
        const packets = await page.evaluate(() => window.__tribute.packets);
        assert.equal(
          packets.length,
          1,
          `${scenario.name}: expected exactly one response`,
        );
        const expectedPayload = scenario.cancel
          ? [255, 255, 255, 255]
          : [scenario.expected.length, ...scenario.expected];
        assert.deepEqual(
          packets[0],
          [expectedPayload.length + 1, 0, 1, ...expectedPayload],
          `${scenario.name}: response bytes`,
        );
        assert.deepEqual(errors, [], `${name}: browser errors`);
        results.push({
          viewport: name,
          scenario: scenario.name,
          response: packets[0],
        });
        console.log(`PASS ${name}: ${scenario.name}`);
      } catch (error) {
        await page.screenshot({
          path: `${folder}/${name}-${scenario.name}-failure.png`,
        });
        throw error;
      }
    }
    await context.close();
  }
} finally {
  writeFileSync(`${folder}/results.json`, JSON.stringify(results, null, 2));
  await browser?.close();
  await vite?.close();
}
