import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = process.env.SMOKE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
});
mkdirSync(".audit-tmp/replay-field-ui", { recursive: true });
const errors = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["portrait", { width: 390, height: 844 }],
    ["narrow", { width: 320, height: 740 }],
    ["landscape", { width: 844, height: 390 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: name !== "desktop",
      hasTouch: name !== "desktop",
    });
    await context.route(/https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) =>
      route.abort(),
    );
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      const card = (player, location, sequence, position, extra = {}) => ({
        code: 46986414,
        type: 1,
        attack: 2500,
        defense: 2100,
        level: 7,
        rank: 0,
        player,
        location,
        sequence,
        position,
        overlay: [],
        counters: [],
        ...extra,
      });
      const initial = {
        names: ["FieldFixtureA", "FieldFixtureB"],
        lp: [8000, 8000],
        turn: 1,
        phase: 4,
        turnPlayer: 0,
        step: 0,
        consumed: 0,
        total: 1,
        events: [],
        cards: [
          card(0, 2, 0, 8),
          card(1, 4, 2, 1, { overlay: [89631139] }),
          card(0, 8, 0, 8, { code: 43711255, type: 2 }),
          card(0, 32, 0, 8),
        ],
      };
      const u32 = (n) => [
        n & 255,
        (n >>> 8) & 255,
        (n >>> 16) & 255,
        (n >>> 24) & 255,
      ];
      const move = (code, from, to) => [
        50,
        ...u32(code),
        ...from,
        ...to,
        ...u32(0),
      ];
      const final = {
        ...initial,
        step: 1,
        consumed: 1,
        lp: [8000, 7000],
        cards: [
          card(0, 4, 1, 4, { counters: [(2 << 16) | 1] }),
          initial.cards[1],
          { ...initial.cards[2], position: 1 },
          initial.cards[3],
        ],
        events: [
          move(46986414, [0, 2, 0, 8], [0, 4, 1, 1]),
          [53, ...u32(46986414), 0, 4, 1, 1, 4],
          move(43711255, [0, 8, 0, 8], [0, 8, 0, 1]),
          [70, ...u32(43711255), 0, 8, 0, 1, 0, 8, 0, ...u32(0), 1],
          [110, 0, 4, 1, 4, 1, 4, 2, 1],
          [101, 1, 0, 0, 4, 1, 2, 0],
          [91, 1, ...u32(1000)],
          [74],
        ],
      };
      let requests = 0;
      window.Worker = class {
        onmessage;
        onerror;
        postMessage(data) {
          if (data.type === "close") return;
          if (data.type === "seek" || data.type === "restart") requests = 0;
          let frame = initial;
          if (data.type === "next") {
            requests++;
            frame =
              requests === 1
                ? final
                : { ...final, step: 2, events: [], end: "complete" };
          }
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
    let sockets = 0;
    page.on("websocket", () => sockets++);
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
    assert.deepEqual(
      await page.locator(".replay-field-player strong").allTextContents(),
      ["FieldFixtureB", "FieldFixtureA"],
    );
    const hand = page.locator(
      '.replay-field-card[data-player="0"][data-location="2"]',
    );
    const handle = await hand.elementHandle();
    await page.getByRole("button", { name: "单步", exact: true }).click();
    await expect(page.locator(".replay-field-action")).toHaveAttribute(
      "data-action",
      "move",
    );
    await expect(
      page.locator(
        '.replay-field-card[data-player="0"][data-location="4"][data-sequence="1"]',
      ),
    ).toBeVisible();
    assert.equal(
      await handle.evaluate((el) => el.isConnected),
      true,
      "A moved card keeps its DOM identity for animation",
    );
    const until = async (kind) => {
      for (let i = 0; i < 12; i++) {
        if (
          (await page
            .locator(".replay-field-action")
            .getAttribute("data-action")) === kind
        )
          return;
        await page.getByRole("button", { name: "单步", exact: true }).click();
        await page.waitForTimeout(30);
      }
      throw new Error(`Missing action ${kind}`);
    };
    await until("position");
    const monster = page.locator(
      '.replay-field-card[data-player="0"][data-location="4"][data-sequence="1"]',
    );
    await expect(monster).toContainText("守备表示");
    await page.getByRole("button", { name: "继续播放", exact: true }).click();
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const pausedAction = await page
      .locator(".replay-field-action")
      .getAttribute("data-action");
    await page.waitForTimeout(850);
    assert.equal(
      await page.locator(".replay-field-action").getAttribute("data-action"),
      pausedAction,
      "Pause must stop queued visual actions",
    );
    await until("chain");
    await expect(page.locator(".replay-field-chain")).toHaveCount(1);
    await page.getByRole("button", { name: "跳到回合", exact: true }).click();
    await expect(page.locator(".replay-field-chain")).toHaveCount(0);
    await expect(page.locator(".replay-field-action")).toHaveAttribute(
      "data-action",
      "ready",
    );
    await until("chain");
    await expect(page.locator(".replay-field-chain")).toHaveCount(1);
    await until("attack");
    await expect(page.locator(".replay-field-arrows line")).toHaveCount(1);
    const before = await page
      .locator(".replay-field-arrows line")
      .getAttribute("y1");
    await page.getByRole("button", { name: "切换视角", exact: true }).click();
    assert.notEqual(
      await page.locator(".replay-field-arrows line").getAttribute("y1"),
      before,
    );
    assert.deepEqual(
      await page.locator(".replay-field-player strong").allTextContents(),
      ["FieldFixtureA", "FieldFixtureB"],
    );
    await page.getByRole("button", { name: "切换视角", exact: true }).click();
    await until("counter");
    await expect(monster).toContainText("指示物 2");
    await monster.click();
    await expect(page.locator(".ant-drawer-open")).toContainText(
      "魔力指示物 × 2",
    );
    await page
      .locator(".ant-drawer-open")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await until("chainEnd");
    await expect(page.locator(".replay-field-chain")).toHaveCount(0);
    await page.getByRole("button", { name: "单步", exact: true }).click();
    await expect(page.locator(".replay-field-player").first()).toContainText(
      "LP 7000",
    );
    await expect(
      page.locator('.replay-field-pile[data-pile="32"][data-player="0"] img'),
    ).toHaveAttribute("src", /card_back\.jpg$/);
    const pile = page.locator(
      '.replay-field-pile[data-player="0"][data-pile="32"]',
    );
    assert.ok(
      (await pile.boundingBox()).height >= 43,
      "Pile controls preserve physical touch height",
    );
    assert.ok(
      (await pile.boundingBox()).width >= 43,
      "Pile controls preserve physical touch width",
    );
    await pile.click();
    await expect(page.locator(".ant-drawer-open")).toContainText("除外");
    await page
      .locator(".ant-drawer-open")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await page.getByRole("button", { name: /放大场地/ }).click();
    assert.ok(
      await page
        .locator(".replay-field-viewport")
        .evaluate(
          (el) =>
            el.scrollWidth > el.clientWidth ||
            el.scrollHeight > el.clientHeight,
        ),
      "Zoom scrolls within field",
    );
    await page.getByRole("button", { name: "恢复大小", exact: true }).click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal page overflow",
    );
    await page.screenshot({
      path: `.audit-tmp/replay-field-ui/${name}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "列表视图", exact: true }).click();
    await expect(page.locator(".replay-board")).toBeVisible();
    await page.getByRole("button", { name: "场地视图", exact: true }).click();
    await expect(page.locator(".replay-field-board")).toBeVisible();
    await page.getByRole("link", { name: "录像列表", exact: true }).click();
    await expect(page.locator(".replay-page")).toBeVisible();
    assert.equal(sockets, 0);
    await context.close();
    console.log(
      `Field replay ${name}: ordered move/position/chain/attack/counter, card identity, perspective, zoom, pile and fallback passed`,
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
