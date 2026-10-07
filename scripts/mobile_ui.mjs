// Touch/UI regression against Vite, using only local fixture stores and no server.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const edge =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
let browser;
let vite;
let origin;
const folder = ".audit-tmp/mobile-ui/after";
mkdirSync(folder, { recursive: true });
const results = [];
const errors = [];

async function bounds(locator, viewport, minWidth = 0, minHeight = 0) {
  await expect(locator).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(async (element) => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const animations = [];
    for (let parent = element; parent; parent = parent.parentElement)
      animations.push(...parent.getAnimations());
    await Promise.all(
      animations
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await expect
    .poll(
      async () => {
        const rect = await locator.boundingBox();
        return Boolean(
          rect &&
            rect.x >= -1 &&
            rect.y >= -1 &&
            rect.x + rect.width <= viewport.width + 1 &&
            rect.y + rect.height <= viewport.height + 1 &&
            rect.width >= minWidth - 1 &&
            rect.height >= minHeight - 1,
        );
      },
      {
        message:
          "Control must settle inside the viewport at its full touch size",
      },
    )
    .toBe(true);
  const rect = await locator.boundingBox();
  assert.ok(
    rect &&
      rect.x >= -1 &&
      rect.y >= -1 &&
      rect.x + rect.width <= viewport.width + 1 &&
      rect.y + rect.height <= viewport.height + 1,
    `Control outside viewport: ${JSON.stringify(rect)}`,
  );
  assert.ok(
    rect.width >= minWidth - 1 && rect.height >= minHeight - 1,
    `Touch target too small: ${JSON.stringify(
      rect,
    )}; expected ${minWidth}x${minHeight}`,
  );
  return rect;
}

async function prepareDuel(page) {
  await page.evaluate(async () => {
    const { initUIContainer } = await import("/src/container/compat.ts");
    const { matStore, cardStore, roomStore, historyStore, InteractType } =
      await import("/src/stores/index.ts");
    const { fetchCard, ygopro } = await import("/src/api/index.ts");
    window.__uiPackets = [];
    const conn = {
      ws: {
        readyState: 1,
        send(packet) {
          window.__uiPackets.push(Array.from(new Uint8Array(packet)));
        },
      },
      isClosed: false,
    };
    initUIContainer(conn);
    matStore.initInfo.me.life = 8000;
    matStore.initInfo.op.life = 8000;
    matStore.selfType = 1;
    matStore.currentPlayer = 0;
    matStore.timeLimits.me = 180;
    matStore.phase.currentPhase =
      ygopro.StocGameMessage.MsgNewPhase.PhaseType.MAIN1;
    roomStore.players = [
      { name: "手机测试玩家", state: 0, isMe: true },
      { name: "另一个测试玩家", state: 0, isMe: false },
    ];
    cardStore.inner = Array.from({ length: 5 }, (_, sequence) => ({
      uuid: `mobile-hand-${sequence}`,
      code: 69247929,
      meta: fetchCard(69247929),
      location: {
        controller: 0,
        zone: ygopro.CardZone.HAND,
        sequence,
        position: ygopro.CardPosition.FACEUP_ATTACK,
        is_overlay: false,
      },
      idleInteractivities: [
        { interactType: InteractType.SUMMON, response: 13 },
      ],
      counters: {},
      isToken: false,
      targeted: false,
      status: 0,
      selectInfo: { selectable: false, selected: false },
    }));
    historyStore.historys = Array.from({ length: 30 }, () => ({
      card: 69247929,
      opponent: false,
      currentLocation: {
        controller: 0,
        zone: ygopro.CardZone.HAND,
        sequence: 0,
        position: ygopro.CardPosition.FACEUP_ATTACK,
      },
      operation: 1,
      target: ygopro.CardZone.GRAVE,
    }));
    location.hash = "#/duel";
  });
  await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("duel-player-life-value").first()).toHaveText(
    "8000",
  );
}

async function waitForVisibleImages(page) {
  await page.locator("img[data-card-image]").evaluateAll(async (images) => {
    await Promise.all(
      images
        .filter((image) => {
          const rect = image.getBoundingClientRect();
          return (
            rect.bottom > 0 &&
            rect.top < innerHeight &&
            rect.right > 0 &&
            rect.left < innerWidth
          );
        })
        .map((image) =>
          Promise.race([
            image.decode().catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 20000)),
          ]),
        ),
    );
  });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

try {
  // A fresh Vite instance prevents HMR module identities from splitting fixture stores.
  if (!process.env.MOBILE_UI_URL) {
    vite = await createServer({
      server: {
        host: "127.0.0.1",
        port: 5187,
        watch: {
          ignored: ["**/.audit-tmp/**", "**/dist/**", "**/releases/**"],
        },
      },
      clearScreen: false,
    });
    await vite.listen();
  }
  origin = process.env.MOBILE_UI_URL || vite.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [name, viewport] of [
    ["portrait", { width: 390, height: 844 }],
    ["landscape", { width: 844, height: 390 }],
    ["small-portrait", { width: 320, height: 640 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => localStorage.setItem("language", "cn"));
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
      }),
    );
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 60000,
    });
    await page.getByRole("button", { name: "编辑卡组", exact: true }).tap();
    await expect(page.getByTestId("deck-name")).toHaveValue("1103-sample");
    await bounds(page.getByTestId("deck-save"), viewport, 44, 44);
    await waitForVisibleImages(page);
    await page.screenshot({ path: `${folder}/${name}-01-deck.png` });
    await page.getByTestId("deck-tab-manage").tap();
    await bounds(page.getByTestId("deck-import-file"), viewport, 44, 44);
    await page.getByRole("button", { name: /新\s*建/ }).tap();
    const deckName = `mobile-${name}`;
    await page.getByTestId("deck-name").fill(deckName);
    await page.getByTestId("deck-tab-search").tap();
    await bounds(page.getByTestId("deck-search-input"), viewport);
    await page.getByTestId("deck-search-input").fill("基因");
    await page.getByTestId("deck-search-submit").tap();
    const result = page.locator(
      '[data-testid="deck-search-card"][data-card-code="69247929"]',
    );
    await expect(result).toBeVisible();
    await bounds(
      result.getByRole("button", { name: /加入主卡组/ }),
      viewport,
      44,
      44,
    );
    await result.getByRole("button", { name: /加入主卡组/ }).tap();
    await result.getByRole("button", { name: /加入副卡组/ }).tap();
    await expect(page.getByTestId("deck-card-panel")).not.toBeVisible();
    await waitForVisibleImages(page);
    await page.screenshot({ path: `${folder}/${name}-02-search.png` });
    await result.getByTestId("deck-card").tap();
    await expect(page.getByTestId("deck-card-panel")).toBeVisible();
    await bounds(page.getByTestId("deck-card-panel-close"), viewport, 44, 44);
    await page.getByTestId("deck-card-panel-close").tap();
    await page.getByRole("button", { name: /筛\s*选/ }).tap();
    await expect(page.getByText("卡片筛选", { exact: true })).toBeVisible();
    await bounds(
      page.getByRole("button", { name: /取\s*消/ }),
      viewport,
      44,
      44,
    );
    await page.getByRole("button", { name: /取\s*消/ }).tap();
    await page.getByTestId("deck-tab-deck").tap();
    const main = page.getByTestId("deck-zone-main");
    const side = page.getByTestId("deck-zone-side");
    await expect(main).toHaveAttribute("data-card-count", "1");
    await expect(side).toHaveAttribute("data-card-count", "1");
    if (name !== "landscape") {
      await page.setViewportSize({ width: 844, height: 390 });
      await expect(main).toHaveAttribute("data-card-count", "1");
      await expect(page.getByTestId("deck-name")).toHaveValue(deckName);
      await page.setViewportSize(viewport);
      for (const [label, code] of [
        ["English", "en"],
        ["日本語", "ja"],
        ["한국어", "ko"],
        ["简体中文", "cn"],
      ]) {
        await page.locator("nav .ant-select").tap();
        await page
          .locator(".ant-select-dropdown:visible .ant-select-item-option")
          .filter({ hasText: label })
          .tap();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("language")))
          .toBe(code);
        await expect(main).toHaveAttribute("data-card-count", "1");
        await expect(side).toHaveAttribute("data-card-count", "1");
        await expect(page.getByTestId("deck-name")).toHaveValue(deckName);
        await bounds(page.getByTestId("deck-save"), viewport, 44, 44);
        await bounds(page.getByTestId("open-settings"), viewport, 44, 44);
        if (name === "small-portrait" && code === "en") {
          await page.screenshot({ path: `${folder}/${name}-en-nav.png` });
        }
      }
    }
    await main.getByRole("button", { name: /移动/ }).tap();
    await expect(main).toHaveAttribute("data-card-count", "0");
    await expect(side).toHaveAttribute("data-card-count", "2");
    await side.getByRole("button", { name: /移动/ }).first().tap();
    await expect(main).toHaveAttribute("data-card-count", "1");
    await main.getByRole("button", { name: /删除/ }).tap();
    await expect(main).toHaveAttribute("data-card-count", "0");
    await page.getByTestId("deck-save").tap();
    await page.getByTestId("deck-tab-manage").tap();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: `下载 ${deckName}`, exact: true })
      .tap();
    const download = await downloadEvent;
    const exported = readFileSync(await download.path(), "utf8");
    assert.match(exported, /!side[\r\n]+69247929/);
    await page.getByTestId("open-settings").tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await bounds(page.getByTestId("settings-close"), viewport, 44, 44);
    await page.screenshot({ path: `${folder}/${name}-03-settings.png` });
    await page.getByTestId("settings-close").tap();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByTestId("open-settings").tap();
    await page.locator(".ant-modal-close").tap();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await prepareDuel(page);
    for (const id of [
      "duel-phase-select",
      "duel-chain-setting",
      "duel-history",
      "duel-chat",
      "duel-surrender",
      "duel-settings",
    ]) {
      await bounds(page.getByTestId(id), viewport, 44, 44);
    }
    await page.screenshot({ path: `${folder}/${name}-04-duel.png` });
    const handCard = page
      .locator('[data-testid="duel-card"][data-card-zone="HAND"]')
      .nth(2);
    await bounds(handCard, viewport);
    await handCard.tap();
    await bounds(page.getByTestId("duel-action-summon"), viewport, 44, 44);
    await page.getByTestId("duel-action-summon").tap();
    await expect
      .poll(() => page.evaluate(() => window.__uiPackets.length))
      .toBe(1);
    assert.deepEqual(
      await page.evaluate(() => window.__uiPackets[0]),
      [5, 0, 1, 13, 0, 0, 0],
    );
    await page.getByTestId("duel-card-panel-close").tap();
    await page.getByTestId("duel-chain-setting").tap();
    await bounds(page.getByTestId("duel-chain-setting-all"), viewport, 44, 44);
    await page.getByTestId("duel-chain-setting-all").tap();
    await expect(page.getByTestId("duel-chain-setting")).toHaveAttribute(
      "data-chain-setting",
      "all",
    );
    await page.evaluate(async () => {
      const { fetchCard } = await import("/src/api/index.ts");
      const { showCardModal } = await import(
        "/src/ui/Duel/Message/CardModal/index.tsx"
      );
      showCardModal({ meta: fetchCard(69247929) });
    });
    await expect(page.getByTestId("duel-card-detail")).toBeVisible();
    await bounds(page.getByTestId("duel-card-panel-close"), viewport, 44, 44);
    const description = page.getByTestId("duel-card-detail");
    const width = await description.evaluate((el) => el.clientWidth);
    assert.ok(width >= 250, `Card detail squeezed to ${width}px`);
    await page.screenshot({ path: `${folder}/${name}-05-card.png` });
    await page.getByTestId("duel-card-panel-close").tap();
    await page.evaluate(async () => {
      const { displayPositionModal } = await import(
        "/src/ui/Duel/Message/PositionModal/index.tsx"
      );
      const { ygopro } = await import("/src/api/index.ts");
      void displayPositionModal([
        ygopro.CardPosition.FACEUP_ATTACK,
        ygopro.CardPosition.FACEUP_DEFENSE,
        ygopro.CardPosition.FACEDOWN_DEFENSE,
      ]);
    });
    const positions = page.getByTestId("duel-position-option");
    await expect(positions).toHaveCount(3);
    for (const position of await positions.all())
      await bounds(position, viewport, 44, 44);
    await page.locator(".ant-modal-close:visible").tap();
    await expect(positions.first()).not.toBeVisible();
    await bounds(page.locator(".ant-modal-close:visible"), viewport, 44, 44);
    await page.locator(".ant-modal-close:visible").tap();
    await expect(positions.first()).toBeVisible();
    await positions.first().tap();
    await expect(page.getByTestId("duel-position-modal")).not.toBeVisible();
    await page.evaluate(async () => {
      const { displayOptionModal } = await import(
        "/src/ui/Duel/Message/OptionModal/index.tsx"
      );
      void displayOptionModal(
        "手机选项测试",
        [
          { info: "选择一个效果", response: 1 },
          { info: "另一个比较长的效果选项说明，用于检查窄屏换行", response: 2 },
        ],
        1,
      );
    });
    const options = page.getByTestId("duel-option-item");
    await expect(options).toHaveCount(2);
    for (const option of await options.all())
      await bounds(option, viewport, 44, 44);
    await options.first().tap();
    await page.getByTestId("duel-option-submit").tap();
    await expect(page.getByTestId("duel-option-modal")).not.toBeVisible();
    await page.evaluate(async () => {
      const { displaySimpleSelectCardsModal } = await import(
        "/src/ui/Duel/Message/SimpleSelectCardsModal/index.tsx"
      );
      const { cardStore } = await import("/src/stores/index.ts");
      window.__uiSelected = null;
      void displaySimpleSelectCardsModal({
        selectables: cardStore.inner.map((card, response) => ({
          meta: card.meta,
          location: card.location,
          response,
        })),
      }).then(
        (cards) => (window.__uiSelected = cards.map((card) => card.response)),
      );
    });
    const cardOptions = page.getByTestId("duel-select-card-option");
    await expect(cardOptions).toHaveCount(5);
    for (const card of await cardOptions.all())
      await bounds(card, viewport, 44, 44);
    await cardOptions.last().tap();
    await bounds(page.getByTestId("duel-card-panel-close"), viewport, 44, 44);
    await page.getByTestId("duel-card-panel-close").tap();
    const selectionSubmit = page.locator(
      '[data-testid="duel-select-card-submit"]:visible',
    );
    await expect(selectionSubmit).toBeEnabled();
    await selectionSubmit.tap();
    await expect
      .poll(() => page.evaluate(() => window.__uiSelected))
      .toEqual([4]);
    await expect(
      page.locator('[data-testid="duel-select-cards-modal"]:visible'),
    ).toHaveCount(0);
    await page.getByTestId("duel-history").tap();
    await expect(page.getByTestId("duel-history-panel")).toBeVisible();
    await bounds(
      page.getByTestId("duel-history-panel-close"),
      viewport,
      44,
      44,
    );
    const historyBody = page.getByTestId("duel-history-panel").locator("..");
    const historyScroll = await historyBody.evaluate((el) => ({
      height: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    assert.ok(
      historyScroll.scroll > historyScroll.height,
      "Long history has no scrollable viewport",
    );
    await page.screenshot({ path: `${folder}/${name}-06-history.png` });
    const bodyRect = await historyBody.boundingBox();
    const cdp = await context.newCDPSession(page);
    for (let index = 0; index <= 8; index++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: index === 0 ? "touchStart" : "touchMove",
        touchPoints: [
          {
            x: bodyRect.x + bodyRect.width / 2,
            y: bodyRect.y + bodyRect.height * (0.8 - index * 0.06),
          },
        ],
      });
      await page.waitForTimeout(25);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => historyBody.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    // A tap during native momentum scrolling stops the fling instead of clicking.
    await expect
      .poll(async () => {
        const before = await historyBody.evaluate((el) => el.scrollTop);
        await page.waitForTimeout(100);
        return Math.abs(
          before - (await historyBody.evaluate((el) => el.scrollTop)),
        );
      })
      .toBeLessThan(1);
    await cdp.detach();
    await page.getByTestId("duel-history-panel-close").tap();
    await expect(page.getByTestId("duel-history-panel")).not.toBeVisible();
    await page.getByTestId("duel-chat").tap();
    await bounds(page.getByTestId("duel-chat-panel-close"), viewport, 44, 44);
    await page.getByTestId("duel-chat-panel-close").tap();
    await page.getByTestId("duel-settings").tap();
    await page.getByTestId("settings-close").tap();
    await expect(page.getByTestId("duel-menu")).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(
      layout.scrollWidth <= layout.width + 1,
      `Horizontal page overflow: ${JSON.stringify(layout)}`,
    );
    results.push({
      name,
      viewport,
      deckEditing:
        "add/move/remove/save/export passed; portrait also preserves unsaved edits on rotation and all four language switches",
      settings: "touch close/X passed",
      duel: "physical-size controls, touch summon packet, position/effect selection, minimization/restore, details/history touch scroll/chat/settings passed",
      productionServerConnected: false,
    });
    console.log(
      `PASS ${name}: touch deck editing, export, settings, duel controls and panels`,
    );
    await context.close();
  }
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await desktop.route("**/duel-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
    }),
  );
  const desktopPage = await desktop.newPage();
  await desktopPage.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(desktopPage.locator('main[data-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  await desktopPage.getByTestId("open-settings").click();
  await expect(desktopPage.getByRole("dialog")).toBeVisible();
  await bounds(desktopPage.getByTestId("settings-close"), {
    width: 1280,
    height: 800,
  });
  await desktopPage.keyboard.press("Escape");
  await expect(desktopPage.getByRole("dialog")).not.toBeVisible();
  await desktop.close();
  console.log("PASS desktop: settings Escape close");
  const missingImages = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await missingImages.route("**/duel-config.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:""};',
    }),
  );
  await missingImages.route("**/*", (route) =>
    /\.(jpg|webp|png)(\?|$)/i.test(new URL(route.request().url()).pathname) &&
    !route.request().url().startsWith(origin)
      ? route.abort()
      : route.continue(),
  );
  const missingPage = await missingImages.newPage();
  await missingPage.goto(origin, { waitUntil: "domcontentloaded" });
  await expect(missingPage.locator('main[data-ready="true"]')).toBeVisible({
    timeout: 60000,
  });
  await missingPage.goto(`${origin}#/build`, { waitUntil: "domcontentloaded" });
  const missingCard = missingPage.getByTestId("deck-card").first();
  const cardLabel = await missingCard.getAttribute("aria-label");
  await expect(missingCard.getByText(cardLabel, { exact: true })).toBeVisible();
  await missingPage.screenshot({ path: `${folder}/missing-images.png` });
  await missingCard.tap();
  await expect(missingPage.getByTestId("deck-card-panel")).toBeVisible();
  await missingPage.getByTestId("deck-card-panel-close").tap();
  await missingImages.close();
  console.log("PASS missing card images: readable names and touch details");
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(
    `${folder}/verification.json`,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        origin,
        results,
        limits:
          "Edge touch emulation and local UI fixtures; Android/iOS devices and complete online duels remain unverified.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      try {
        await page.screenshot({ path: `${folder}/failure.png` });
        console.log((await page.locator("body").innerText()).slice(0, 2000));
      } catch {}
    }
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
}
