// Synthetic UI / packet regression; never connects to a duel server.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/side-ui/after",
  outDir = `${folder}/web-dist`;
const fixture = {
  main: [...Array(40).fill(69247929), ...Array(20).fill(43711255)],
  extra: Array(15).fill(44508094),
  side: [...Array(10).fill(89631139), ...Array(5).fill(44508094)],
};
const words = {
  zh: {
    side: "移入备牌",
    main: "移回主卡组",
    extra: "移回额外卡组",
    reset: "重置",
    confirm: "确定",
  },
  en: {
    side: "Move to Side",
    main: "Move to Main",
    extra: "Move to Extra",
    reset: "Reset",
    confirm: "Confirm",
  },
  ja: {
    side: "サイドへ移動",
    main: "メインに戻す",
    extra: "エクストラに戻す",
    reset: "リセット",
    confirm: "確定",
  },
  ko: {
    side: "사이드로 이동",
    main: "메인으로 이동",
    extra: "엑스트라로 이동",
    reset: "초기화",
    confirm: "확인",
  },
};
// STOC_CHAT: the notices SRVPro sends while the peer leaves and returns.
const chatPacket = (player, text) => {
  const body = [];
  for (const ch of `${text}\0`)
    body.push(ch.charCodeAt(0) & 255, ch.charCodeAt(0) >> 8);
  const length = 3 + body.length;
  return [length & 255, length >> 8, 25, player & 255, player >> 8, ...body];
};
const profiles = [
  { name: "portrait", width: 390, height: 844, columns: 6 },
  { name: "landscape", width: 844, height: 390, columns: 13 },
  { name: "small", width: 320, height: 640, columns: 4 },
  { name: "desktop", width: 1280, height: 800 },
];
const reports = [];
let browser, server;
try {
  mkdirSync(folder, { recursive: true });
  if (!process.argv.includes("--built"))
    await build({
      logLevel: "warn",
      build: { outDir },
      plugins: [
        {
          name: "side-test-only-fixture",
          enforce: "pre",
          transform(code, id) {
            if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
            return (
              code +
              `
        import { initUIContainer as initSideFixture, getUIContainer as sideFixtureContainer } from "@/container/compat";
        import handleSideFixtureMessage from "@/service/onSocketMessage";
        import { roomStore as fixtureRoomStore, sideStore as fixtureSideStore, SideStage as FixtureStage } from "@/stores";
        window.__sideTest = {
          prepare(deck) {
            window.__sidePackets = [];
            initSideFixture({ws:{readyState:1,send(packet){window.__sidePackets.push(Array.from(packet));}},cancelled:false,isClosed(){return false;},duelStarted:true});
            fixtureSideStore.setSideDeck(deck);
            fixtureSideStore.stage = FixtureStage.SIDE_CHANGING;
            fixtureRoomStore.selfType = 1;
            location.hash = "#/side";
          },
          async receive(bytes) {
            await handleSideFixtureMessage(sideFixtureContainer(), new MessageEvent("message", {data: Uint8Array.from(bytes).buffer}));
          },
          complete() { fixtureSideStore.stage = FixtureStage.SIDE_CHANGED; },
          selectTurn() { fixtureSideStore.stage = FixtureStage.TP_SELECTING; },
          stored() { return fixtureSideStore.getSideDeck(); }
        };`
            );
          },
        },
      ],
    });
  if (!process.argv.includes("--built"))
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
  for (const profile of profiles) {
    const mobile = !!profile.columns;
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(origin)) return route.continue();
      // Deterministic card-art placeholder. Actual card metadata comes from local CDBs.
      if (/\.(jpg|webp|png)(\?|$)/i.test(route.request().url()))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="59" height="86"><rect width="59" height="86" fill="#69562d"/><rect x="4" y="8" width="51" height="42" fill="#536b85"/></svg>',
        });
      return route.abort();
    });
    const page = await context.newPage(),
      errors = [];
    let sockets = 0;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", () => sockets++);
    const snapshot = () =>
      page.evaluate(() =>
        Object.fromEntries(
          ["main", "extra", "side"].map((type) => [
            type,
            Array.from(
              document.querySelectorAll(
                `[data-testid="deck-zone-${type}"] [data-testid="deck-card"]`,
              ),
              (element) => +element.dataset.cardCode,
            ),
          ]),
        ),
      );
    const zone = (type) => page.getByTestId(`deck-zone-${type}`);
    const move = async (source, id, label) => {
      const card = zone(source).locator(`[data-card-code="${id}"]`).last();
      const wrapper = card.locator("..");
      if (mobile) {
        const control = wrapper.getByTestId("deck-card-move");
        await control.scrollIntoViewIfNeeded();
        assert.ok((await control.boundingBox()).height >= 44);
        await expect(control).toHaveAttribute("aria-label", new RegExp(label));
        await control.tap();
      } else await wrapper.locator("button:visible").first().click();
      await expect(page.getByRole("menu")).not.toBeVisible();
    };
    for (const [lang, text] of Object.entries(words)) {
      console.log(`Side ${profile.name} / ${lang}`);
      await page.goto(`${origin}?lang=${lang}#/`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 45000,
      });
      await page.evaluate((deck) => window.__sideTest.prepare(deck), fixture);
      await expect(page.getByTestId("side-confirm")).toBeVisible();
      await expect(page.getByTestId("side-reset")).toHaveText(text.reset);
      await expect(page.getByTestId("side-confirm")).toHaveText(text.confirm);
      assert.deepEqual(await snapshot(), fixture);
      const density = await zone("main").evaluate((element) => {
        const card = element.querySelector('[data-testid="deck-card"]');
        return {
          columns: getComputedStyle(
            card.parentElement.parentElement,
          ).gridTemplateColumns.split(" ").length,
          cardWidth: card.getBoundingClientRect().width,
        };
      });
      if (mobile) {
        assert.equal(density.columns, profile.columns);
        assert.ok(density.cardWidth >= 44 && density.cardWidth < 75);
        for (const id of ["side-reset", "side-confirm"])
          assert.ok((await page.getByTestId(id).boundingBox()).height >= 44);
      }
      const scroll = page.getByTestId("side-scroll-area");
      const checkBottom = async () => {
        await expect
          .poll(() =>
            page
              .getByTestId("side-page")
              .evaluate((element) =>
                Math.round(element.getBoundingClientRect().height),
              ),
          )
          .toBe(page.viewportSize().height);
        await scroll.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        const last = mobile
          ? zone("side").getByTestId("deck-card-move").last()
          : zone("side").getByTestId("deck-card").last();
        await expect(last).toBeInViewport({ ratio: 1 });
        const control = await last.boundingBox(),
          viewport = page.viewportSize();
        assert.ok(
          control.y + control.height <= viewport.height - (mobile ? 60 : 0),
        );
        await expect(page.getByTestId("side-confirm")).toBeInViewport({
          ratio: 1,
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      };
      await checkBottom();
      if (mobile && lang === "zh") {
        // Exercise the last column repeatedly: a tap must move exactly one card,
        // with no auto-aligned popup appearing or competing with the touch target.
        for (let attempt = 0; attempt < 3; attempt++) {
          const right = zone("main")
            .getByTestId("deck-card-move")
            .nth(profile.columns - 1);
          await right.scrollIntoViewIfNeeded();
          const firstBounds = await right.boundingBox();
          await page.waitForTimeout(200);
          assert.deepEqual(await right.boundingBox(), firstBounds);
          await right.tap();
          await expect(zone("main")).toHaveAttribute("data-card-count", "59");
          await expect(zone("side")).toHaveAttribute("data-card-count", "16");
          await expect(page.getByRole("menu")).not.toBeVisible();
          await expect(page.getByTestId("deck-card-panel")).not.toBeVisible();
          assert.deepEqual(await page.evaluate(() => window.__sidePackets), []);
          await page.getByTestId("side-reset").tap();
          assert.deepEqual(await snapshot(), fixture);
        }
      }
      if (mobile && lang === "zh") {
        await page.screenshot({
          path: `${folder}/${profile.name}-editing.png`,
        });
        await scroll.evaluate((element) => {
          element.scrollTop = 0;
        });
        const card = await zone("main")
          .getByTestId("deck-card")
          .first()
          .boundingBox();
        const cdp = await context.newCDPSession(page);
        const x = card.x + card.width / 2,
          y = card.y + card.height / 2;
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let delta = 10; delta <= 90; delta += 10) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - delta }],
          });
          await page.waitForTimeout(16);
        }
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await expect
          .poll(() => scroll.evaluate((element) => element.scrollTop))
          .toBeGreaterThan(10);
        await expect(page.getByTestId("deck-card-panel")).not.toBeVisible();
        await cdp.detach();
        // Let the native fling finish before beginning a separate card tap.
        await page.waitForTimeout(500);
        await scroll.evaluate((element) => {
          element.scrollTop = 0;
        });
        await zone("main").getByTestId("deck-card").first().tap();
        await expect(page.getByTestId("deck-card-panel")).toBeVisible();
        await page.getByTestId("deck-card-panel-close").tap();
        await expect(page.getByTestId("deck-card-panel")).not.toBeVisible();
        // Safari's toolbar reducing usable height must still leave the final card reachable.
        await page.setViewportSize({
          width: profile.width,
          height: profile.height - 100,
        });
        await checkBottom();
        await page.setViewportSize({
          width: profile.width,
          height: profile.height,
        });
      }
      await move("main", 69247929, text.side);
      await expect(zone("side")).toHaveAttribute("data-card-count", "16");
      await page.getByTestId("side-confirm").click();
      await expect(page.getByTestId("side-feedback")).toHaveAttribute(
        "role",
        "alert",
      );
      assert.deepEqual(await page.evaluate(() => window.__sidePackets), []);
      await move("side", 89631139, text.main);
      await move("extra", 44508094, text.side);
      await move("side", 44508094, text.extra);
      const changed = await snapshot();
      assert.equal(changed.main.length, 60);
      assert.equal(changed.extra.length, 15);
      assert.equal(changed.side.length, 15);
      assert.deepEqual(
        Object.values(changed).flat().sort(),
        Object.values(fixture).flat().sort(),
      );
      // Reconnection/leave prefixes are not this player's Side submission.
      // Keep the edited cards, scroll position, layout and enabled confirmation.
      const beforeDisconnect = await page
        .getByTestId("side-scroll-area")
        .evaluate((element) => ({
          top: element.scrollTop,
          height: element.clientHeight,
          width: element.clientWidth,
        }));
      for (const bytes of [
        [1, 0, 21],
        chatPacket(8, "Opponent disconnected, waiting for reconnection"),
        [1, 0, 8],
        chatPacket(11, "x".repeat(300)),
        [1, 0, 21],
      ]) {
        await page.evaluate((bytes) => window.__sideTest.receive(bytes), bytes);
        await expect(page.getByTestId("side-confirm")).toBeEnabled();
        assert.deepEqual(await snapshot(), changed);
        assert.deepEqual(
          await page.getByTestId("side-scroll-area").evaluate((element) => ({
            top: element.scrollTop,
            height: element.clientHeight,
            width: element.clientWidth,
          })),
          beforeDisconnect,
        );
        assert.deepEqual(await page.evaluate(() => window.__sidePackets), []);
      }
      if (mobile && lang === "zh") {
        await page.setViewportSize({
          width: profile.height,
          height: profile.width,
        });
        await expect
          .poll(async () => JSON.stringify(await snapshot()))
          .toBe(JSON.stringify(changed));
        await checkBottom();
        await page.setViewportSize({
          width: profile.width,
          height: profile.height,
        });
        await page.locator(".ant-select-selector").tap();
        await page
          .locator(".ant-select-item-option")
          .filter({ hasText: "English" })
          .click();
        await expect(page.getByTestId("side-page")).toHaveAttribute(
          "data-language",
          "en",
        );
        assert.deepEqual(await snapshot(), changed);
        await page.locator(".ant-select-selector").tap();
        await page
          .locator(".ant-select-item-option")
          .filter({ hasText: "简体中文" })
          .click();
        await expect(page.getByTestId("side-page")).toHaveAttribute(
          "data-language",
          "cn",
        );
        assert.deepEqual(await snapshot(), changed);
      }
      await page.getByTestId("side-reset").click();
      await expect
        .poll(async () => JSON.stringify(await snapshot()))
        .toBe(JSON.stringify(fixture));
      await move("main", 69247929, text.side);
      await move("side", 89631139, text.main);
      const submitted = await snapshot();
      await page.getByTestId("side-confirm").click();
      const packets = await page.evaluate(() => window.__sidePackets);
      assert.equal(packets.length, 1);
      const bytes = Buffer.from(packets[0]);
      assert.equal(bytes[2], 2);
      assert.equal(bytes.readUInt32LE(3), 75);
      assert.equal(bytes.readUInt32LE(7), 15);
      assert.deepEqual(
        Array.from({ length: 90 }, (_, index) =>
          bytes.readUInt32LE(11 + index * 4),
        ),
        [...submitted.main, ...submitted.extra, ...submitted.side],
      );
      assert.deepEqual(
        await page.evaluate(() => window.__sideTest.stored()),
        submitted,
      );
      await expect(page.getByTestId("side-confirm")).toBeDisabled();
      await expect(page.getByTestId("side-feedback")).toHaveAttribute(
        "role",
        "status",
      );
      // Chat stays reachable: a column on desktop, a button with an unread
      // count and an overlay panel on touch layouts.
      if (mobile) {
        await expect(page.getByTestId("waitroom-chat")).toHaveCount(0);
        await expect(page.getByTestId("side-chat").locator("..").locator(".ant-badge-count")).toBeVisible();
        const before = await scroll.evaluate((element) => element.clientWidth);
        await page.getByTestId("side-chat").click();
        const panel = page.getByTestId("side-chat-panel");
        await expect(panel.getByTestId("waitroom-chat-message").last()).toContainText("x".repeat(300));
        await expect(panel.getByTestId("waitroom-chat-input")).toBeVisible();
        assert.equal(await scroll.evaluate((element) => element.clientWidth), before, "The chat panel overlays the editor");
        await page.getByTestId("side-chat-panel-close").click();
        await expect(page.getByTestId("side-chat").locator("..").locator(".ant-badge-count")).toHaveCount(0);
      } else {
        await expect(page.getByTestId("side-chat")).toHaveCount(0);
        await expect(page.getByTestId("waitroom-chat-message").last()).toContainText("x".repeat(300));
      }
      if (lang === "zh") {
        await scroll.evaluate((element) => {
          element.scrollTop = 0;
        });
        await page.screenshot({ path: `${folder}/${profile.name}.png` });
      }
      reports.push({
        profile: profile.name,
        lang,
        ...density,
        bottomReachable: true,
        exactPacket: true,
        peerDisconnectPreservesEditor: true,
      });
    }
    if (profile.name === "desktop") {
      // A rejection reopens the same draft; it never requires a remount/reset.
      const submitted = await snapshot();
      await page.evaluate(() =>
        window.__sideTest.receive([9, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0]),
      );
      await expect(page.getByTestId("side-confirm")).toBeEnabled();
      assert.deepEqual(await snapshot(), submitted);
      await page.evaluate(() => window.__sideTest.receive([2, 0, 19, 7]));
      await page.evaluate(() => window.__sideTest.receive([1, 0, 8]));
      await expect(page.getByTestId("side-confirm")).toBeDisabled();
      await page.evaluate((deck) => window.__sideTest.prepare(deck), fixture);
      await page.evaluate(() => window.__sideTest.receive([2, 0, 19, 1]));
      // Core may send DUEL_START + MSG_WIN + DUEL_END when the peer leaves
      // permanently in Side. The result must be dismissible on this route.
      await page.evaluate(() => {
        void window.__sideTest.receive([1, 0, 21, 4, 0, 1, 5, 1, 4, 1, 0, 22]);
      });
      await expect(page.getByTestId("duel-end-modal")).toBeVisible();
      await expect(page.getByTestId("duel-end-modal")).toHaveAttribute(
        "data-duel-result",
        "win",
      );
      await page.locator(".ant-modal-footer button").last().click();
      await expect.poll(() => page.url()).toMatch(/#\/match/);
    }
    assert.equal(sockets, 0);
    assert.deepEqual(errors, []);
    writeFileSync(`${folder}/metrics.json`, JSON.stringify(reports, null, 2));
    await context.close();
  }
  writeFileSync(`${folder}/metrics.json`, JSON.stringify(reports, null, 2));
  console.log(
    JSON.stringify({ reports, onlineConnections: 0, realPhoneTested: false }),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
