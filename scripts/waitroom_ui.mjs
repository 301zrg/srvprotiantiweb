// Local room fixtures emulate Core's automatic readiness on UPDATE_DECK.
// No connection is made to the production server.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const before = process.argv.includes("--capture-before");
const folder = `.audit-tmp/waitroom-ui/${before ? "before" : "after"}`;
mkdirSync(folder, { recursive: true });
let browser;
let vite;
const errors = [];
const results = [];
const scenarios = [
  ["portrait", { width: 390, height: 844 }, true],
  ["landscape", { width: 844, height: 390 }, true],
  ["small-landscape", { width: 568, height: 320 }, true],
  ["small-portrait", { width: 320, height: 640 }, true],
  ["desktop", { width: 1280, height: 800 }, false],
];

async function fixture(page, mode = 0, host = true) {
  await page.evaluate(
    async ({ mode, host }) => {
      const { initUIContainer, getUIContainer } = await import(
        "/src/container/compat.ts"
      );
      const { roomStore, deckStore, chatStore } = await import(
        "/src/stores/index.ts"
      );
      const { ygopro } = await import("/src/api/index.ts");
      const changePlayer = (await import("/src/service/room/hsPlayerChange.ts"))
        .default;
      const changeType = (await import("/src/service/room/typeChange.ts"))
        .default;
      window.__roomPackets = [];
      window.__seatChange = (pos, state, moved_pos) =>
        changePlayer(
          getUIContainer(),
          new ygopro.YgoStocMsg({
            stoc_hs_player_change: new ygopro.StocHsPlayerChange({
              pos,
              state,
              moved_pos,
            }),
          }),
        );
      window.__roomStates = ygopro.StocHsPlayerChange.State;
      const conn = {
        isClosed: false,
        close() {
          this.isClosed = true;
        },
        ws: {
          readyState: 1,
          send(payload) {
            const packet = Array.from(new Uint8Array(payload));
            window.__roomPackets.push(packet);
            const me = roomStore.players.findIndex((player) => player?.isMe);
            if (me < 0 && ![32, 33].includes(packet[2])) return;
            if ([2, 34, 35].includes(packet[2]))
              setTimeout(() => {
                window.__seatChange(
                  me,
                  packet[2] === 35
                    ? window.__roomStates.NO_READY
                    : window.__roomStates.READY,
                );
              }, 30);
            if (packet[2] === 33) {
              window.__seatChange(me, window.__roomStates.TO_OBSERVER);
              changeType(
                getUIContainer(),
                new ygopro.YgoStocMsg({
                  stoc_type_change: new ygopro.StocTypeChange({
                    self_type: ygopro.StocTypeChange.SelfType.OBSERVER,
                    is_host: host,
                  }),
                }),
              );
            }
            if (packet[2] === 32) {
              const pos = roomStore.players.findIndex((player) => !player);
              changeType(
                getUIContainer(),
                new ygopro.YgoStocMsg({
                  stoc_type_change: new ygopro.StocTypeChange({
                    self_type: pos + 1,
                    is_host: host,
                  }),
                }),
              );
              roomStore.players[pos].name = "手机测试玩家";
            }
          },
        },
      };
      window.__roomConnection = conn;
      initUIContainer(conn);
      roomStore.reset();
      roomStore.joined = true;
      roomStore.isHost = host;
      roomStore.selfType = ygopro.StocTypeChange.SelfType.PLAYER1;
      roomStore.hostInfo = {
        mode,
        lflist: 0x73ec4051,
        rule: 0,
        duelRule: 2,
        startLp: 8000,
        startHand: 5,
        drawCount: 1,
        timeLimit: 180,
        noCheckDeck: false,
        noShuffleDeck: false,
      };
      roomStore.players = [
        {
          name: "手机测试玩家",
          state: window.__roomStates.NO_READY,
          isMe: true,
        },
        {
          name: "很长的对手昵称用于检查手机显示",
          state: window.__roomStates.NO_READY,
          isMe: false,
        },
        undefined,
        undefined,
      ];
      if (!deckStore.decks.some((deck) => deck.deckName === "备用测试卡组"))
        deckStore.decks.push({
          ...JSON.parse(JSON.stringify(deckStore.decks[0])),
          deckName: "备用测试卡组",
        });
      chatStore.sender = 0;
      chatStore.message = "欢迎进入测试房间，请选好卡组后准备。";
      location.hash = "#/waitroom";
    },
    { mode, host },
  );
  await expect(page.getByTestId("room-host-info")).toBeVisible();
}

async function touchBounds(locator, viewport, mobile) {
  await expect(locator).toBeVisible();
  await locator.evaluate(async (element) => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    for (let parent = element; parent; parent = parent.parentElement) {
      await Promise.all(
        parent
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getComputedTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    }
  });
  await expect
    .poll(async () => {
      const rect = await locator.boundingBox();
      return (
        !!rect &&
        rect.x >= -1 &&
        rect.y >= -1 &&
        rect.x + rect.width <= viewport.width + 1 &&
        rect.y + rect.height <= viewport.height + 1 &&
        (!mobile || (rect.width >= 43 && rect.height >= 43))
      );
    })
    .toBe(true);
  const box = await locator.boundingBox();
  assert.ok(
    box &&
      box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= viewport.width + 1 &&
      box.y + box.height <= viewport.height + 1,
    JSON.stringify(box),
  );
  if (mobile)
    assert.ok(
      box.width >= 43 && box.height >= 43,
      `Small touch target ${JSON.stringify(box)}`,
    );
}

try {
  vite = await createServer({
    server: {
      host: "127.0.0.1",
      port: 5188,
      watch: { ignored: ["**/.audit-tmp/**", "**/dist/**", "**/releases/**"] },
    },
    clearScreen: false,
  });
  await vite.listen();
  const origin = vite.resolvedUrls.local[0];
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [name, viewport, mobile] of scenarios) {
    const context = await browser.newContext({
      viewport,
      isMobile: mobile,
      hasTouch: mobile,
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
    await fixture(page);
    await page.screenshot({ path: `${folder}/${name}-01-room.png` });
    if (before) {
      await context.close();
      continue;
    }
    const ready = page.getByTestId("waitroom-ready-toggle");
    const start = page.getByTestId("waitroom-start");
    const click = (locator) => (mobile ? locator.tap() : locator.click());
    await expect(ready).toHaveAttribute("data-player-ready", "false");
    await expect(ready).toHaveText("准备决斗");
    assert.deepEqual(await page.evaluate(() => window.__roomPackets), []);
    await expect(start).toBeDisabled();
    for (const id of [
      "waitroom-ready-toggle",
      "waitroom-start",
      "waitroom-chat-toggle",
      "waitroom-leave",
    ])
      await touchBounds(page.getByTestId(id), viewport, mobile);
    assert.equal(
      await page
        .getByTestId("waitroom")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
    );
    for (const seat of [0, 1])
      await touchBounds(
        page.locator(`[data-player-seat="${seat}"]`),
        viewport,
        false,
      );
    await click(page.getByTestId("waitroom-deck-select"));
    await click(
      page
        .locator(".ant-select-item-option")
        .filter({ hasText: "备用测试卡组" }),
    );
    await expect(page.getByTestId("waitroom-deck-select")).toContainText(
      "备用测试卡组",
    );
    assert.deepEqual(await page.evaluate(() => window.__roomPackets), []);
    await click(ready);
    await expect(ready).toHaveAttribute("data-player-ready", "true");
    await expect(ready).toHaveText("取消准备");
    assert.deepEqual(
      await page.evaluate(() =>
        window.__roomPackets.map((packet) => packet[2]),
      ),
      [2, 34],
    );
    await expect(start).toBeDisabled();
    await page.evaluate(() =>
      window.__seatChange(1, window.__roomStates.READY),
    );
    await expect(start).toBeEnabled();
    await click(ready);
    await expect(ready).toHaveAttribute("data-player-ready", "false");
    await expect(start).toBeDisabled();
    // Cancelling a ready state by changing the deck must NOT upload a new deck.
    await click(ready);
    await expect(ready).toHaveAttribute("data-player-ready", "true");
    const beforeDeckSwitch = await page.evaluate(
      () => window.__roomPackets.length,
    );
    await click(page.getByTestId("waitroom-deck-select"));
    await click(
      page
        .locator(".ant-select-item-option")
        .filter({ hasText: "1103-sample" }),
    );
    await expect(ready).toHaveAttribute("data-player-ready", "false");
    assert.deepEqual(
      await page.evaluate(
        (n) => window.__roomPackets.slice(n).map((packet) => packet[2]),
        beforeDeckSwitch,
      ),
      [35],
    );

    // Chat remains usable and remembers its draft across close/open and rotation.
    await click(page.getByTestId("waitroom-chat-toggle"));
    if (mobile) {
      await expect(page.getByTestId("waitroom-chat-panel")).toBeVisible();
      await touchBounds(
        page.getByTestId("waitroom-chat-input"),
        viewport,
        true,
      );
      await touchBounds(page.getByTestId("waitroom-chat-send"), viewport, true);
      await page.getByTestId("waitroom-chat-input").fill("未发送的聊天草稿");
      await page.screenshot({ path: `${folder}/${name}-02-chat.png` });
      await click(page.getByTestId("waitroom-chat-panel-close"));
      await expect(page.getByTestId("waitroom-chat-panel")).not.toBeVisible();
      await page.evaluate(async () => {
        const { chatStore } = await import("/src/stores/index.ts");
        chatStore.message = "聊天收起时收到的消息";
      });
      await click(page.getByTestId("waitroom-chat-toggle"));
      await expect(page.getByTestId("waitroom-chat-input")).toHaveValue(
        "未发送的聊天草稿",
      );
      await expect(page.getByTestId("waitroom-chat-dialogs")).toContainText(
        "聊天收起时收到的消息",
      );
      await click(page.getByTestId("waitroom-chat-panel-close"));
      await expect(page.getByTestId("waitroom-chat-panel")).not.toBeVisible();
    } else {
      await expect(page.getByTestId("waitroom-sidebar")).not.toBeVisible();
      await expect(page.getByTestId("waitroom-chat-toggle")).toHaveText(
        "展开聊天",
      );
      await touchBounds(page.getByTestId("waitroom-leave"), viewport, false);
      await click(page.getByTestId("waitroom-chat-toggle"));
      await expect(page.getByTestId("waitroom-sidebar")).toBeVisible();
    }

    await click(page.getByTestId("waitroom-role-toggle"));
    await expect(ready).not.toBeVisible();
    await expect(page.getByTestId("waitroom-ready-hint")).toContainText("观战");
    await click(page.getByTestId("waitroom-role-toggle"));
    await expect(ready).toHaveAttribute("data-player-ready", "false");

    // A Tag host requires four occupied, individually ready seats.
    await fixture(page, 2);
    await expect(page.locator("[data-player-seat]")).toHaveCount(4);
    await expect(page.getByTestId("waitroom-tag-warning")).toBeVisible();
    await click(ready);
    await expect(ready).toHaveAttribute("data-player-ready", "true");
    await page.evaluate(() =>
      window.__seatChange(1, window.__roomStates.READY),
    );
    await expect(start).toBeDisabled();
    await page.evaluate(async () => {
      const { roomStore } = await import("/src/stores/index.ts");
      roomStore.players[2] = {
        name: "第三席",
        state: window.__roomStates.NO_READY,
      };
      window.__seatChange(2, window.__roomStates.READY);
    });
    await expect(page.locator('[data-player-seat="2"]')).toHaveAttribute(
      "data-player-ready",
      "true",
    );
    await expect(start).toBeDisabled();
    await page.evaluate(async () => {
      const { roomStore } = await import("/src/stores/index.ts");
      roomStore.players[3] = {
        name: "第四席",
        state: window.__roomStates.NO_READY,
      };
    });
    await expect(start).toBeDisabled();
    await page.evaluate(() =>
      window.__seatChange(3, window.__roomStates.READY),
    );
    await expect(start).toBeEnabled();
    await page.screenshot({ path: `${folder}/${name}-03-tag.png` });
    await page.evaluate(() =>
      window.__seatChange(3, window.__roomStates.NO_READY),
    );
    await expect(start).toBeDisabled();
    await page.evaluate(() =>
      window.__seatChange(3, window.__roomStates.LEAVE),
    );
    await expect(page.locator('[data-player-seat="3"]')).toHaveAttribute(
      "data-player-name",
      "",
    );
    await page.evaluate(() =>
      window.__seatChange(2, window.__roomStates.MOVE, 3),
    );
    await expect(page.locator('[data-player-seat="3"]')).toHaveAttribute(
      "data-player-name",
      "第三席",
    );
    await expect(page.locator('[data-player-seat="2"]')).toHaveAttribute(
      "data-player-name",
      "",
    );
    // The same-slot move must not accidentally erase a player.
    await page.evaluate(() =>
      window.__seatChange(3, window.__roomStates.MOVE, 3),
    );
    await expect(page.locator('[data-player-seat="3"]')).toHaveAttribute(
      "data-player-name",
      "第三席",
    );
    await page.evaluate(() =>
      window.__seatChange(3, window.__roomStates.TO_OBSERVER),
    );
    await expect(page.locator('[data-player-seat="3"]')).toHaveAttribute(
      "data-player-name",
      "",
    );
    await expect(start).toBeDisabled();

    if (name === "portrait") {
      // Four languages and rotation retain the chosen deck and server state.
      for (const [label, code] of [
        ["English", "en"],
        ["日本語", "ja"],
        ["한국어", "ko"],
        ["简体中文", "cn"],
      ]) {
        await click(
          page
            .locator(".ant-select")
            .filter({ has: page.getByRole("combobox", { name: "界面语言" }) }),
        );
        await page
          .locator(".ant-select-item-option")
          .filter({ hasText: label })
          .click();
        await expect
          .poll(() => page.evaluate(() => localStorage.getItem("language")))
          .toBe(code);
        await expect(ready).toHaveAttribute("data-player-ready", "true");
        await touchBounds(ready, viewport, true);
        await touchBounds(page.getByTestId("waitroom-leave"), viewport, true);
      }
      await page.setViewportSize({ width: 844, height: 390 });
      await touchBounds(ready, { width: 844, height: 390 }, true);
      await page.setViewportSize(viewport);
      await touchBounds(ready, viewport, true);
    }
    await page.evaluate(async () => {
      const { roomStore } = await import("/src/stores/index.ts");
      roomStore.isHost = false;
    });
    await expect(start).toBeDisabled();
    await expect(start).toHaveText("等待房主开始");
    await page.evaluate(async () => {
      const { roomStore, RoomStage } = await import("/src/stores/index.ts");
      const { eventbus, Task } = await import("/src/infra/index.ts");
      roomStore.stage = RoomStage.HAND_SELECTING;
      eventbus.emit(Task.Mora);
    });
    for (const move of ["rock", "scissors", "paper"])
      await touchBounds(
        page.getByTestId(`waitroom-mora-${move}`),
        viewport,
        mobile,
      );
    await click(page.getByTestId("waitroom-mora-rock"));
    assert.deepEqual(
      await page.evaluate(() => window.__roomPackets.at(-1)),
      [2, 0, 3, 2],
    );
    await page.evaluate(async () => {
      const { roomStore, RoomStage } = await import("/src/stores/index.ts");
      const { eventbus, Task } = await import("/src/infra/index.ts");
      roomStore.stage = RoomStage.TP_SELECTING;
      eventbus.emit(Task.Tp);
    });
    await touchBounds(page.getByTestId("waitroom-tp-first"), viewport, mobile);
    await touchBounds(page.getByTestId("waitroom-tp-second"), viewport, mobile);
    await click(page.getByTestId("waitroom-tp-first"));
    assert.deepEqual(
      await page.evaluate(() => window.__roomPackets.at(-1)),
      [2, 0, 4, 1],
    );
    await click(page.getByTestId("waitroom-leave"));
    await expect(page.getByTestId("connect-submit")).toBeVisible();
    assert.equal(
      await page.evaluate(() => window.__roomConnection.isClosed),
      true,
    );
    results.push({
      name,
      viewport,
      manualReadiness: true,
      fourSeatGate: true,
      chatAndExit: true,
    });
    console.log(
      `PASS ${name}: manual ready, deck switch, room controls, chat, all-four-ready Tag gate`,
    );
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${folder}/verification.json`,
    JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2),
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      try {
        await page.screenshot({ path: `${folder}/failure.png` });
      } catch {}
    }
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
}
