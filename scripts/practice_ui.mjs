import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4178";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
mkdirSync(".audit-tmp/practice-ui", { recursive: true });
const errors = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["portrait", { width: 390, height: 844 }],
    ["narrow", { width: 320, height: 640 }],
    ["landscape", { width: 844, height: 390 }],
  ].filter(
    ([name]) =>
      process.argv.length <= 2 || process.argv.slice(2).includes(name),
  )) {
    const context = await browser.newContext({
      viewport,
      hasTouch: name !== "desktop",
      isMobile: name !== "desktop",
    });
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.__practiceTrace = {
        frames: [],
        configs: [],
        terminated: [],
        workers: [],
      };
      const Native = window.Worker;
      window.Worker = class extends Native {
        constructor(...args) {
          super(...args);
          this.index = window.__practiceTrace.workers.length;
          window.__practiceTrace.workers.push(this);
          this.addEventListener("message", ({ data }) => {
            if (data.type === "frame") {
              window.__practiceTrace.frames.push({
                worker: this.index,
                frame: data.frame,
              });
              window.__practiceTrace.last = data.frame;
            }
          });
        }
        postMessage(data, ...args) {
          if (data.type === "open")
            window.__practiceTrace.configs.push(data.config);
          return super.postMessage(data, ...args);
        }
        terminate() {
          window.__practiceTrace.terminated.push(this.index);
          return super.terminate();
        }
      };
    });
    const page = await context.newPage();
    let sockets = 0;
    page.on("websocket", () => sockets++);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/#/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 60000,
    });
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const req = indexedDB.open("decks");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("decks", "readwrite"),
            store = tx.objectStore("decks");
          store.clear();
          for (const [deckName, code] of [
            ["Practice A", 26202165],
            ["Practice B", 97268402],
          ])
            store.put(
              { deckName, main: Array(40).fill(code), extra: [], side: [] },
              deckName,
            );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.goto(origin + "/#/practice");
    await page.reload();
    await expect(page.getByTestId("practice-page")).toBeVisible({
      timeout: 60000,
    });
    await page.locator('.ant-select[aria-label="B 方卡组"]').click();
    await page.getByText("Practice B", { exact: true }).last().click();
    await page.getByTestId("practice-start").click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "idle",
      { timeout: 120000 },
    );
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-player",
      "0",
    );
    const initial = await page.evaluate(
      () => window.__practiceTrace.last.cards,
    );
    assert.equal(
      initial.filter((c) => c.player === 0 && c.location === 2).length,
      6,
    );
    assert.equal(
      initial.filter((c) => c.player === 1 && c.location === 2).length,
      5,
    );
    await page.locator('.practice-choice[data-action="0"]').first().click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "place",
    );
    await page.locator(".practice-choice").first().click();
    await page.getByTestId("practice-confirm").click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "chain",
    );
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-player",
      "1",
    );
    assert.equal(
      await page.evaluate(() => window.__practiceTrace.last.turnPlayer),
      0,
    );
    if (name !== "desktop") {
      const heading = await page
        .getByTestId("practice-choices")
        .locator("h2")
        .boundingBox();
      assert.ok(
        heading &&
          heading.y >= 40 &&
          heading.y + heading.height < viewport.height,
        "A new opponent request must show its acting-player heading above the choices",
      );
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: ".audit-tmp/practice-ui/" + name + ".png",
      fullPage: true,
    });
    await page.getByTestId("practice-cancel").click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "idle",
    );
    await page.locator('.practice-choice[data-action="7"]').click();
    for (let i = 0; i < 20; i++) {
      await expect(page.getByTestId("practice-choices")).toBeVisible();
      const choice = page.getByTestId("practice-choices");
      if (
        (await choice.getAttribute("data-kind")) === "idle" &&
        (await choice.getAttribute("data-player")) === "1"
      )
        break;
      await page.getByTestId("practice-cancel").click();
    }
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-player",
      "1",
    );
    await page.locator('.practice-choice[data-action="0"]').first().click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "place",
    );
    await page.locator(".practice-choice").first().click();
    await page.getByTestId("practice-confirm").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__practiceTrace.last.cards.some(
            (c) => c.player === 1 && c.location === 4,
          ),
        ),
      )
      .toBe(true);
    await page.getByTestId("practice-retry").click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "idle",
      { timeout: 120000 },
    );
    assert.deepEqual(
      await page.evaluate(() => window.__practiceTrace.last.cards),
      initial,
    );
    await page.getByTestId("practice-redeal").click();
    await expect(page.getByTestId("practice-choices")).toHaveAttribute(
      "data-kind",
      "idle",
      { timeout: 120000 },
    );
    const configs = await page.evaluate(() => window.__practiceTrace.configs);
    assert.deepEqual(configs[0], configs[1]);
    assert.notDeepEqual(configs[1].seed, configs[2].seed);
    const state = await page.getByTestId("practice-state").innerText();
    await page.evaluate(() => {
      window.__practiceTrace.workers[0].dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "frame",
            frame: {
              turn: 999,
              lp: [1, 2],
              pending: { id: 1, player: 1, kind: "idle", choices: [] },
              cards: [],
              events: [],
            },
          },
        }),
      );
    });
    await page.waitForTimeout(150);
    assert.equal(
      await page.getByTestId("practice-state").innerText(),
      state,
      "Destroyed worker cannot overwrite the new session",
    );
    await page
      .getByRole("button", { name: "返回卡组编辑", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/build/);
    assert.ok(
      await page.evaluate(() => window.__practiceTrace.terminated.length >= 3),
    );
    assert.equal(sockets, 0);
    await context.close();
    console.log(
      "Practice " +
        name +
        ": real Core, MR2 draw, both players, opponent chain, exact retry, new seed, stale Worker rejected, zero WSS: PASS",
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
