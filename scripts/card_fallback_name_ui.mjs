// Card names under missing card art: shown on readable cards, never on
// unknown/hidden cards, hidden where boards are scaled too small to read.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
const errors = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["narrow", { width: 320, height: 740 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name !== "desktop",
      hasTouch: name !== "desktop",
    });
    // Every external request fails, so no card art ever arrives.
    await context.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.abort(),
    );
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      localStorage.setItem(
        "__neo_setting_config__",
        JSON.stringify({ replayAutoPlay: false }),
      );
      const card = (player, location, sequence, position, code) => ({
        code,
        type: 33,
        attack: 1800,
        defense: 1000,
        level: 4,
        rank: 0,
        player,
        location,
        sequence,
        position,
        overlay: [],
        counters: [],
      });
      const frame = {
        names: ["A", "B"],
        lp: [8000, 8000],
        turn: 1,
        phase: 4,
        turnPlayer: 0,
        step: 0,
        consumed: 0,
        total: 1,
        events: [],
        cards: [
          card(0, 4, 1, 1, 42647539),
          card(1, 4, 2, 1, 46986414),
          // Unknown face-down card: the board must not invent a name.
          card(1, 4, 3, 8, 0),
        ],
      };
      window.Worker = class {
        postMessage(data) {
          if (data.type === "close") return;
          setTimeout(
            () =>
              this.onmessage?.({
                data: { type: "frame", frame: structuredClone(frame) },
              }),
            0,
          );
        }
        terminate() {}
      };
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/#/replays", { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    await page
      .locator('input[type="file"]')
      .setInputFiles("tests/fixtures/replay/native-deckout.yrp");
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await expect(page.locator(".replay-field-board")).toBeVisible();
    await page.waitForTimeout(600);
    const names = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.replay-field-viewport [data-testid="card-fallback-name"]',
        ),
      ].map((node) => {
        const span = node.querySelector("span");
        const scale =
          parseFloat(getComputedStyle(node).getPropertyValue("--board-scale")) ||
          1;
        return {
          text: span.textContent,
          visible: span.getBoundingClientRect().height > 1,
          font: parseFloat(getComputedStyle(span).fontSize) * scale,
        };
      }),
    );
    // Two known faces; the unknown card has no name element at all.
    assert.deepEqual(
      names.map((n) => n.text).sort(),
      ["石像怪道化师", "黑魔术师"].sort(),
      `${name}: names only for known faces`,
    );
    if (name === "desktop") {
      assert.ok(
        names.every((n) => n.visible && n.font >= 8.9 && n.font <= 13.1),
        `desktop names are readable: ${JSON.stringify(names)}`,
      );
    } else {
      assert.ok(
        names.every((n) => !n.visible),
        `small phone boards hide unreadable names: ${JSON.stringify(names)}`,
      );
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Card fallback names: readable on desktop, none for unknown cards, hidden on small phone boards",
  );
} finally {
  await browser.close();
}
