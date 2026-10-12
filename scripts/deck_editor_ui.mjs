// Built client with test-only hooks and synthetic decks; no live WSS.
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const output = ".audit-tmp/deck-editor";
mkdirSync(output, { recursive: true });
const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const reports = [];
let browser, server;
async function touchDrag(page, context, source, target) {
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  const cdp = await context.newCDPSession(page);
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * i) / 12,
          y: start.y + ((end.y - start.y) * i) / 12,
        },
      ],
    });
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}
try {
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "error",
      build: { outDir: `${output}/client` },
      plugins: [
        {
          name: "deck-editor-test-only",
          transform(code, id) {
            if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
            return (
              code +
              `
          import * as editStore from "@/ui/BuildDeck/store";
          import * as editor from "@/ui/BuildDeck";
          import * as stores from "@/stores";
          import * as api from "@/api";
          import * as utils from "@/ui/BuildDeck/utils";
          window.__editor = { editStore, editor, stores, api, utils };
        `
            );
          },
        },
      ],
    });
    cpSync("neos-assets", `${output}/client/neos-assets`, { recursive: true });
  }
  server = await preview({
    build: { outDir: `${output}/client` },
    preview: { host: "127.0.0.1", port: 0 },
  });
  const origin = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath: existsSync(edge) ? edge : undefined,
  });
  for (const [profile, width, height, mobile] of [
    ["desktop", 1280, 800, false],
    ["wide", 1600, 900, false],
    ["portrait", 390, 844, true],
    ["landscape", 844, 390, true],
    ["narrow", 320, 640, true],
  ].filter(
    (profile) =>
      !process.env.DECK_EDITOR_PROFILE ||
      profile[0] === process.env.DECK_EDITOR_PROFILE,
  )) {
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
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
      }),
    );
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 60000,
    });
    const name =
      "1103-sample-Asceticism Six Samurai — 指定抽卡顺序的测试卡组 — ".repeat(
        3,
      );
    await page.evaluate(async (name) => {
      const { stores, editor, utils, editStore, api } = window.__editor;
      const base = {
        deckName: name,
        main: [89631139, 46986414, 26202165, 54652250],
        extra: [44508094, 23995346],
        side: [46986414, 54652250],
      };
      await stores.deckStore.add(base);
      editor.setSelectedDeck(base);
      window.__fixture = {
        base,
        name,
        reset: async (main = base.main, extra = base.extra, side = base.side) =>
          editStore.editDeckStore.set(
            await utils.iDeckToEditingDeck({ ...base, main, extra, side }),
          ),
        read: () => utils.editingDeckToIDeck(editStore.editDeckStore),
      };
      location.hash = "#/build";
    }, name);
    const zone = (type) => page.getByTestId(`deck-zone-${type}`);
    const cards = (type) => zone(type).getByTestId("deck-card");
    await expect(cards("main")).toHaveCount(4);
    const nameField = page.getByTestId("deck-name");
    await expect(nameField).toHaveValue(name);
    const metrics = await nameField.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      contentWidth: el.scrollWidth,
      contentHeight: el.scrollHeight,
    }));
    assert.ok(
      metrics.contentWidth <= metrics.width + 1 &&
        metrics.contentHeight <= metrics.height + 1,
      "Full deck name must be visible without internal scrolling",
    );
    await page.screenshot({ path: `${output}/${profile}-name.png` });
    async function add(type, index) {
      const cell = cards(type).nth(index).locator("..");
      if (mobile) {
        await cell.getByTestId("deck-card-menu").click();
        await page.getByRole("menuitem", { name: /添加/ }).click();
        await expect(page.locator(".ant-dropdown:visible")).toHaveCount(0);
      } else await cell.getByTestId("deck-card-add").click();
    }
    const read = () => page.evaluate(() => window.__fixture.read());
    const reset = (main, extra, side) =>
      page.evaluate(
        async (args) => window.__fixture.reset(...args),
        [main, extra, side],
      );
    await add("main", 0);
    await add("main", 0);
    await expect(cards("main")).toHaveCount(6);
    const beforeReject = await read();
    await add("main", 0);
    assert.deepEqual(
      await read(),
      beforeReject,
      "Fourth copy must be rejected",
    );
    await add("main", 2);
    assert.deepEqual(
      await read(),
      beforeReject,
      "Limited Sangan must not be duplicated",
    );
    await add("side", 0);
    await expect(cards("side")).toHaveCount(3);
    const sideAdded = await read();
    assert.deepEqual(sideAdded.main, beforeReject.main);
    assert.deepEqual(sideAdded.side, [46986414, 54652250, 46986414]);
    await add("side", 0);
    assert.deepEqual(
      await read(),
      sideAdded,
      "Combined main and side copies must not exceed three",
    );
    await reset([55144522], [44508094], [5318639]);
    await expect(cards("main")).toHaveCount(1);
    assert.equal(
      await page.evaluate(() =>
        window.__editor.api.forbidden.get(
          window.__editor.api.fetchCard(55144522),
        ),
      ),
      0,
    );
    await add("main", 0);
    await expect(cards("main")).toHaveCount(1);
    await add("side", 0);
    await expect(cards("side")).toHaveCount(2);
    await add("side", 0);
    await expect(cards("side")).toHaveCount(2);
    await add("extra", 0);
    await expect(cards("extra")).toHaveCount(2);
    await reset();
    await expect(cards("main")).toHaveCount(4);
    console.log(`PASS ${profile}: all add limits and destination zones`);
    if (mobile) {
      await page.getByTestId("deck-reorder-toggle").click();
      await expect(zone("main").getByTestId("deck-card-reorder")).toHaveCount(
        4,
      );
      const bounds = await zone("main")
        .getByTestId("deck-card-reorder")
        .first()
        .boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44);
    }
    for (const [type, expected] of [
      ["main", [46986414, 26202165, 89631139, 54652250]],
      ["extra", [23995346, 44508094]],
      ["side", [54652250, 46986414]],
    ]) {
      const to = type === "main" ? 2 : 1;
      if (mobile)
        await touchDrag(
          page,
          context,
          zone(type).getByTestId("deck-card-reorder").first(),
          cards(type).nth(to),
        );
      else await cards(type).first().dragTo(cards(type).nth(to));
      await expect.poll(async () => (await read())[type]).toEqual(expected);
    }
    await reset([89631139, 46986414, 89631139, 54652250]);
    if (mobile)
      await touchDrag(
        page,
        context,
        zone("main").getByTestId("deck-card-reorder").nth(2),
        cards("main").nth(3),
      );
    else await cards("main").nth(2).dragTo(cards("main").nth(3));
    await expect
      .poll(async () => (await read()).main)
      .toEqual([89631139, 46986414, 54652250, 89631139]);
    if (mobile) await page.getByTestId("deck-reorder-toggle").click();
    const last = cards("main").last().locator("..");
    if (mobile) {
      await last.getByTestId("deck-card-menu").click();
      await page.getByRole("menuitem", { name: /删除/ }).click();
      await expect(page.locator(".ant-dropdown:visible")).toHaveCount(0);
    } else await last.getByTestId("deck-card-remove").click();
    await expect
      .poll(async () => (await read()).main)
      .toEqual([89631139, 46986414, 54652250]);
    const ordered = await read();
    await page.getByTestId("deck-save").click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__editor.editStore.editDeckStore.edited),
      )
      .toBe(false);
    assert.deepEqual(
      await page.evaluate(
        (name) => window.__editor.stores.deckStore.get(name),
        name,
      ),
      ordered,
      "Saving must retain exact array order",
    );
    const persisted = await page.evaluate(
      (name) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open("decks");
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result,
              read = db.transaction("decks").objectStore("decks").get(name);
            read.onsuccess = () => {
              db.close();
              resolve(read.result);
            };
            read.onerror = () => reject(read.error);
          };
        }),
      name,
    );
    assert.deepEqual(
      persisted,
      ordered,
      "IndexedDB must retain the exact saved order",
    );
    if (mobile) await page.getByTestId("deck-tab-manage").click();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `下载 ${name}`, exact: true })
      .click();
    const download = await downloaded;
    await download.saveAs(`${output}/${profile}-ordered.ydk`);
    const exported = readFileSync(`${output}/${profile}-ordered.ydk`, "utf8");
    assert.ok(exported.includes("#main\n89631139\n46986414\n54652250\n#extra"));
    if (mobile) await page.getByTestId("deck-tab-deck").click();
    const limits = await page.evaluate(async () => {
      const h = window.__editor,
        store = h.editStore.editDeckStore,
        a = h.api.fetchCard(89631139);
      store.main = [a, a];
      store.side = [a];
      const alias = { ...a, id: 99900001, data: { ...a.data, alias: a.id } };
      const sameName = !store.canAdd(alias, "main", "search").result;
      store.main = Array.from({ length: 60 }, () => h.api.fetchCard(46986414));
      store.side = Array.from({ length: 15 }, () => h.api.fetchCard(54652250));
      store.extra = Array.from({ length: 15 }, () => h.api.fetchCard(23995346));
      return {
        sameName,
        main: !store.canAdd(a, "main", "search").result,
        side: !store.canAdd(a, "side", "search").result,
        extra: !store.canAdd(h.api.fetchCard(44508094), "extra", "search")
          .result,
      };
    });
    assert.ok(Object.values(limits).every(Boolean));
    if (mobile) {
      // Card-image swipes must scroll even while the dedicated handles are enabled.
      await page.getByTestId("deck-reorder-toggle").click();
      await cards("main").first().scrollIntoViewIfNeeded();
      const card = await cards("main").first().boundingBox();
      const ancestors = () =>
        cards("main")
          .first()
          .evaluate((el) => {
            let sum = 0;
            for (let node = el; node; node = node.parentElement)
              sum += node.scrollTop;
            return sum;
          });
      const before = await ancestors(),
        beforeCards = await read();
      const cdp = await context.newCDPSession(page),
        x = card.x + card.width / 2,
        y = card.y + card.height / 2;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let d = 10; d <= 80; d += 10) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y - d }],
        });
        await page.waitForTimeout(20);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await expect.poll(ancestors).toBeGreaterThan(before + 10);
      assert.deepEqual(
        await read(),
        beforeCards,
        "Scrolling must not reorder cards",
      );
      await cdp.detach();
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("deck-name")).toHaveValue(name, {
      timeout: 60000,
    });
    await expect(cards("main")).toHaveCount(3);
    assert.deepEqual(
      await cards("main").evaluateAll((els) =>
        els.map((el) => Number(el.dataset.cardCode)),
      ),
      ordered.main,
      "Reload must keep the saved order",
    );
    assert.deepEqual(errors, []);
    reports.push({
      profile,
      metrics,
      limits,
      exactOrderSaved: true,
      touchSort: mobile,
      errors,
    });
    console.log(
      `PASS ${profile}: full name, add limits, real dragging, duplicate position, save/export${
        mobile ? " and image scrolling" : ""
      }`,
    );
    await context.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
