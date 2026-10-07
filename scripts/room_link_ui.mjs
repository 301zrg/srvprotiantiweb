import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { chromium, expect, webkit } from "@playwright/test";
import { createServer, preview } from "vite";

const built = process.argv.includes("--built");
const safari = process.argv.includes("--webkit");
const results = [];
let browser, vite;
try {
  vite = built
    ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
    : await createServer({ server: { host: "127.0.0.1", port: 0 } });
  if (!built) await vite.listen();
  const origin = vite.resolvedUrls.local[0];
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await (safari ? webkit : chromium).launch({
    headless: true,
    executablePath:
      safari ? undefined : process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (process.platform === "win32" && existsSync(edge) ? edge : undefined),
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1280, height: 800 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort("blockedbyclient"),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:"wss://room-link-test.invalid/neos"};',
      }),
    );
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      localStorage.setItem("playerNickname", "SavedPlayer");
      const mock = (window.__roomLink = {
        urls: [],
        packets: [],
        ack: false,
        confirmed: false,
        earlyRole: false,
        closed: 0,
      });
      const NativeWebSocket = window.WebSocket;
      const decode = (bytes) =>
        new TextDecoder("utf-16le")
          .decode(Uint8Array.from(bytes))
          .split("\0")[0];
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        constructor(url, protocols) {
          // Development-only Vite HMR stays local and is not a duel connection.
          if (!String(url).startsWith("wss://room-link-test.invalid/"))
            return new NativeWebSocket(url, protocols);
          mock.urls.push(url);
          window.__roomSocket = this;
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.(new Event("open"));
          }, 0);
        }
        emit(opcode, payload) {
          const bytes = Uint8Array.from([0, 0, opcode, ...payload]);
          new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
          this.onmessage?.(new MessageEvent("message", { data: bytes.buffer }));
        }
        send(value) {
          const packet = [...new Uint8Array(value)];
          mock.packets.push(packet);
          if (packet[2] === 18) {
            if (decode(packet.slice(11)) === "CLOSED") {
              setTimeout(() => {
                this.onerror?.(new Event("error"));
                this.close();
              }, 0);
              return;
            }
            const roomName = decode(packet.slice(11));
            const running =
              roomName === "M#TT,RANDOM#12345" ||
              roomName.startsWith("SLOW-SPECTATE") ||
              roomName === "HISTORY-MATCH";
            setTimeout(() => {
              mock.ack = true;
              const host = new Uint8Array(20),
                view = new DataView(host.buffer);
              view.setUint32(0, 0x73ec4051, true);
              host[4] = 1;
              host[5] = running ? 1 : 0;
              host[6] = 2;
              view.setInt32(12, 8000, true);
              host[16] = 5;
              host[17] = 1;
              view.setUint16(18, 180, true);
              this.emit(18, host);
              this.emit(19, [running ? 7 : 0]);
              for (const [seat, name] of [
                [0, "PlayerA"],
                [1, "PlayerB"],
              ]) {
                const bytes = new Uint8Array(41),
                  v = new DataView(bytes.buffer);
                [...name].forEach((char, i) =>
                  v.setUint16(i * 2, char.charCodeAt(0), true),
                );
                bytes[40] = seat;
                this.emit(32, bytes);
              }
              if (running) {
                mock.confirmed = true;
                const start = new Uint8Array(17),
                  v = new DataView(start.buffer);
                start[0] = 0x10;
                v.setInt32(1, 6000, true);
                v.setInt32(5, 7200, true);
                v.setUint16(9, 40, true);
                v.setUint16(13, 40, true);
                this.emit(1, [4, ...start]);
                if (roomName === "HISTORY-MATCH") {
                  this.emit(1, [5, 0, 0]); // Earlier game in the same match.
                  this.emit(8, []); // Players side deck; observers stay connected.
                  this.emit(21, []);
                  this.emit(1, [4, ...start]);
                  v.setInt32(1, 4800, true);
                  this.emit(1, [5, 1, 0]);
                  this.emit(8, []);
                  this.emit(21, []);
                  this.emit(1, [4, ...start]); // Current third game.
                  this.emit(1, [90, 0, 1, 0, 0, 0, 0]);
                }
                if (roomName.startsWith("SLOW-SPECTATE")) {
                  this.emit(1, [90, 0, 1, 0, 0, 0, 0]); // Public hidden draw.
                  this.emit(1, [131, 0, 2, 2, 5]); // Both dice results must be visible.
                  const life = new Uint8Array(4);
                  new DataView(life.buffer).setInt32(0, 5500, true);
                  this.emit(1, [94, 0, ...life]);
                }
              }
            }, 30);
          } else if (packet[2] === 33) {
            mock.earlyRole ||= !mock.ack;
            window.__confirmSpectator = () => {
              mock.confirmed = true;
              this.emit(33, [9]); // The temporarily assigned duelist seat becomes vacant.
              this.emit(19, [7]);
            };
          }
        }
        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          mock.closed++;
          this.onclose?.(new CloseEvent("close", { code: 1000 }));
        }
      }
      window.WebSocket = MockWebSocket;
    });
    const errors = [];
    async function open(query, outer = false, slowDuel = false) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      if (slowDuel)
        await page.route(
          built ? /\/assets\/Main-[^/]+\.js$/ : "**/src/ui/Duel/Main.tsx",
          async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            await route.continue();
          },
        );
      await page.goto(`${origin}${outer ? "?" : "#/match?"}${query}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      try {
        await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      } catch (error) {
        console.log(JSON.stringify({ body: await page.locator("body").innerText(), errors }));
        throw error;
      }
      return page;
    }
    const room = "测试房 # + & ?";
    const query = new URLSearchParams({ room, spectate: "1" }).toString();
    const page = await open(query);
    await page.waitForFunction(
      () => window.__roomLink.ack && !window.__roomLink.confirmed,
    );
    assert.ok(
      new URL(page.url()).hash.startsWith("#/match?"),
      "Must wait for spectator confirmation",
    );
    await page.waitForFunction(() => !!window.__confirmSpectator);
    await page.evaluate(() => window.__confirmSpectator());
    await expect(page.getByTestId("waitroom-role-toggle")).toHaveText(
      /加入决斗者/,
    );
    await expect(page.getByTestId("waitroom-ready-toggle")).toHaveCount(0);
    const packets = await page.evaluate(() => window.__roomLink);
    const decode = (bytes, offset) =>
      new TextDecoder("utf-16le")
        .decode(Uint8Array.from(bytes.slice(offset, offset + 40)))
        .split("\0")[0];
    assert.equal(packets.urls.length, 1);
    assert.equal(packets.urls[0], "wss://room-link-test.invalid/neos");
    assert.equal(
      decode(
        packets.packets.find((p) => p[2] === 16),
        3,
      ),
      "observer from web",
    );
    assert.equal(
      decode(
        packets.packets.find((p) => p[2] === 18),
        11,
      ),
      room,
    );
    assert.equal(packets.packets.filter((p) => p[2] === 33).length, 1);
    assert.equal(packets.earlyRole, false);
    assert.ok(
      !packets.packets.some((p) => [2, 34, 37].includes(p[2])),
      "No deck upload, ready, or start",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("playerNickname")),
      "SavedPlayer",
    );
    await page.getByRole("button", { name: "退出房间" }).click();
    await expect(page.locator("#player-nickname")).toHaveValue("SavedPlayer");
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => window.__roomLink.urls.length),
      1,
      "Exit must not auto-rejoin",
    );
    await page.close();

    const running = await open(
      new URLSearchParams({
        room: "M#TT,RANDOM#12345",
        spectate: "1",
        nickname: "网页观众",
      }).toString(),
      true,
    );
    await expect(running.getByTestId("duel-switch-view")).toBeVisible({
      timeout: 20000,
    });
    await expect(running.getByTestId("duel-surrender")).toHaveCount(0);
    const runningPackets = await running.evaluate(
      () => window.__roomLink.packets,
    );
    assert.equal(
      decode(
        runningPackets.find((p) => p[2] === 16),
        3,
      ),
      "网页观众",
    );
    assert.equal(
      decode(
        runningPackets.find((p) => p[2] === 18),
        11,
      ),
      "M#TT,RANDOM#12345",
    );
    assert.equal(new URL(running.url()).search, "");
    await running.getByTestId("duel-switch-view").click();
    await expect(running.getByTestId("duel-switch-view")).toHaveAttribute(
      "data-view-controller",
      "1",
    );
    await running.getByTestId("duel-leave-spectating").click();
    await expect(running.locator("#player-nickname")).toHaveValue(
      "SavedPlayer",
    );
    await running.close();

    // A cold phone can take longer than the old one-second start delay to
    // mount card components. History must PLAY before live updates, not snap.
    const slow = await open("room=SLOW-SPECTATE&spectate=1", false, true);
    // Even after the old fixed start delay, the draw waits for the cold route.
    if (!built) {
      await slow.waitForTimeout(1400);
      const early = await slow.evaluate(async () => {
        const { cardStore } = await import("/src/stores/cardStore.ts");
        return cardStore.inner.filter((card) => card.location.zone === 2).length;
      });
      assert.equal(early, 0, "historical draw must wait for mounted card effects");
    }
    await expect(slow.getByTestId("duel-switch-view")).toBeVisible({
      timeout: 20000,
    });
    const nearLife = slow.locator(
      '[data-testid="duel-player-life"][data-player="me"]',
    );
    await expect(nearLife).toHaveAttribute("data-life", "5500", {
      timeout: 8000,
    });
    await slow.evaluate(() => {
      const life = new Uint8Array(4);
      new DataView(life.buffer).setInt32(0, 5100, true);
      window.__roomSocket.emit(1, [94, 0, ...life]);
    });
    await expect(nearLife).toHaveAttribute("data-life", "5100");
    await expect(slow.locator('[data-testid="duel-card"][data-card-zone="HAND"]')).toHaveCount(1);
    if (!built) {
      const animation = await slow.evaluate(async () => {
        const { asyncStart } = await import("/src/ui/Duel/PlayMat/Card/springs/utils.ts");
        const { getUIContainer } = await import("/src/container/compat.ts");
        const conn = getUIContainer().conn;
        const makeApi = () => ({
          starts: 0, stops: 0, values: {},
          start() { this.starts++; return [new Promise(() => {})]; },
          stop() { this.stops++; },
          pause() { this.pauses = (this.pauses || 0) + 1; },
          resume() { this.resumes = (this.resumes || 0) + 1; },
          set(values) { this.values = values; },
        });
        // A suspended spring never fires onResolve. Its timeout must release
        // the caller and commit the requested final position.
        conn.pendingMessages = 0;
        const suspended = makeApi(), before = performance.now();
        await asyncStart(suspended)({ x: 42 });
        const duration = performance.now() - before;
        // Buffered history must use the same animation path as live events.
        conn.pendingMessages = 1;
        const catchup = makeApi();
        let resolveHistory;
        catchup.start = function () {
          this.starts++;
          return [new Promise((resolve) => { resolveHistory = resolve; })];
        };
        let historyFinished = false;
        const buffered = asyncStart(catchup)({ x: 73 }).then(() => { historyFinished = true; });
        await new Promise((resolve) => setTimeout(resolve, 150));
        const historyPending = !historyFinished;
        resolveHistory();
        await buffered;
        conn.pendingMessages = 0;
        const background = makeApi();
        let resolveBackground;
        background.start = function () {
          this.starts++;
          return [new Promise((resolve) => { resolveBackground = resolve; })];
        };
        let backgroundFinished = false;
        const pending = asyncStart(background)({ y: 15 }).then(() => { backgroundFinished = true; });
        await new Promise((resolve) => setTimeout(resolve, 20));
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((resolve) => setTimeout(resolve, 3200));
        const backgroundPending = !backgroundFinished;
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
        resolveBackground();
        await pending;
        return { suspended, duration, catchup, historyPending, background, backgroundPending };
      });
      assert.equal(animation.suspended.stops, 1);
      assert.equal(animation.suspended.values.x, 42);
      assert.ok(animation.duration >= 2900 && animation.duration < 4500);
      assert.equal(animation.catchup.starts, 1);
      assert.equal(animation.catchup.stops, 0);
      assert.equal(animation.historyPending, true);
      assert.equal(animation.backgroundPending, true);
      assert.equal(animation.background.stops, 0);
      assert.equal(animation.background.pauses, 1);
      assert.equal(animation.background.resumes, 1);
    }
    await slow.getByTestId("duel-leave-spectating").click();
    await expect(slow.locator("#player-nickname")).toBeVisible();
    await slow.close();

    const history = await open("room=HISTORY-MATCH&spectate=1");
    await expect(history.getByTestId("duel-switch-view")).toBeVisible({
      timeout: 20000,
    });
    const historyLife = history.locator(
      '[data-testid="duel-player-life"][data-player="me"]',
    );
    await expect(historyLife).toHaveAttribute("data-life", "4800", {
      timeout: 12000,
    });
    await expect(history.getByTestId("duel-end-modal")).toBeHidden();
    await expect(history.getByTestId("duel-card")).toHaveCount(106);
    await expect(history.locator('[data-testid="duel-card"][data-card-zone="HAND"]')).toHaveCount(1);
    await history.evaluate(() => {
      window.__roomSocket.emit(1, [5, 0, 0]);
      window.__roomSocket.emit(8, []);
    });
    await expect(history.getByTestId("duel-observer-wait")).toBeVisible();
    await expect(history.getByTestId("duel-end-modal")).toBeHidden();
    await expect(history.getByTestId("duel-leave-spectating")).toBeEnabled();
    await history.evaluate(() => {
      const start = new Uint8Array(17), view = new DataView(start.buffer);
      start[0] = 0x11;
      view.setInt32(1, 8000, true);
      view.setInt32(5, 7000, true);
      view.setUint16(9, 40, true);
      view.setUint16(13, 40, true);
      window.__roomSocket.emit(21, []);
      window.__roomSocket.emit(1, [4, ...start]);
    });
    await expect(historyLife).toHaveAttribute("data-life", "8000");
    await expect(history.getByTestId("duel-observer-wait")).toHaveCount(0);
    await expect(history.getByTestId("duel-card")).toHaveCount(106);
    await expect(history.locator('[data-testid="duel-card"][data-card-zone="HAND"]')).toHaveCount(0);
    await history.getByTestId("duel-leave-spectating").click();
    await expect(history.locator("#player-nickname")).toBeVisible();
    await history.close();

    const locked = await open("room=locked&spectate=1&autojoin=0", true);
    await expect(locked.locator("#player-nickname")).toHaveValue(
      "observer from web",
    );
    await expect(locked.locator("#room-name")).toHaveValue("locked");
    await expect(locked.locator("body")).toContainText("此链接不会自动连接");
    assert.equal(await locked.evaluate(() => window.__roomLink.urls.length), 0);
    await locked.locator("#room-name").fill("locked$dummy");
    assert.equal(await locked.evaluate(() => window.__roomLink.urls.length), 0);
    await locked.getByTestId("connect-submit").click();
    await locked.waitForFunction(() => !!window.__confirmSpectator);
    await locked.evaluate(() => window.__confirmSpectator());
    await expect(locked.getByTestId("waitroom-role-toggle")).toHaveText(
      /加入决斗者/,
    );
    const lockedPackets = await locked.evaluate(
      () => window.__roomLink.packets,
    );
    assert.equal(
      decode(
        lockedPackets.find((p) => p[2] === 18),
        11,
      ),
      "locked$dummy",
    );
    assert.ok(!locked.url().includes("dummy"));
    assert.equal(
      await locked.evaluate(() => localStorage.getItem("playerNickname")),
      "SavedPlayer",
    );
    await locked.close();

    const prefill = await open(new URLSearchParams({ room }).toString(), true);
    await expect(prefill.locator("#room-name")).toHaveValue(room);
    await expect(prefill.locator("#player-nickname")).toHaveValue(
      "SavedPlayer",
    );
    assert.equal(
      await prefill.evaluate(() => window.__roomLink.urls.length),
      0,
    );
    await prefill.locator("#player-nickname").fill("DraftPlayer$dummy");
    await prefill.locator("#room-name").fill("draft-room$dummy");
    await prefill.evaluate((query) => {
      location.hash = `#/match?${query}`;
    }, query);
    await prefill.waitForFunction(() => !!window.__confirmSpectator);
    await prefill.evaluate(() => window.__confirmSpectator());
    await expect(prefill.getByTestId("waitroom-role-toggle")).toHaveText(
      /加入决斗者/,
    );
    await prefill.getByRole("button", { name: "退出房间" }).click();
    await expect(prefill.locator("#player-nickname")).toHaveValue(
      "DraftPlayer$dummy",
    );
    await expect(prefill.locator("#room-name")).toHaveValue("draft-room$dummy");
    await prefill.close();

    if (!mobile) {
      const denied = await open("room=NO-WATCH&spectate=1");
      await denied.waitForFunction(() => !!window.__confirmSpectator);
      await expect(denied.locator("body")).toContainText(
        "服务器未确认观战身份",
        { timeout: 15000 },
      );
      assert.equal(
        await denied.evaluate(() => window.__roomLink.urls.length),
        1,
      );
      assert.equal(await denied.evaluate(() => window.__roomLink.closed), 1);
      await denied.close();
    }

    const failed = await open("room=CLOSED&spectate=1");
    await expect(failed.locator("[role=alert]")).toContainText("WSS 连接失败");
    assert.equal(await failed.evaluate(() => window.__roomLink.urls.length), 1);
    await failed.locator("#room-name").fill("retry-room");
    assert.equal(
      await failed.evaluate(() => window.__roomLink.urls.length),
      1,
      "Editing must not automatically retry",
    );
    await failed.getByTestId("connect-submit").click();
    await failed.waitForFunction(() => !!window.__confirmSpectator);
    await failed.evaluate(() => window.__confirmSpectator());
    await expect(failed.getByTestId("waitroom-role-toggle")).toHaveText(
      /加入决斗者/,
    );
    assert.equal(await failed.evaluate(() => window.__roomLink.urls.length), 2);
    await failed.close();

    for (const [query, warning] of [
      ["room=TT&spectate=1", "具体房间名"],
      ["room=test&spectate=unexpected", "参数无效"],
      ["room=test&spectate=1&autojoin=unexpected", "参数无效"],
      ["room=test&spectate=1&nickname=player%24dummy", "参数无效"],
      ["room=test%24dummy&spectate=1", "参数无效"],
      ["room=" + "x".repeat(20) + "&spectate=1", "1–19"],
      ["room=test%00&spectate=1", "1–19"],
    ]) {
      const invalid = await open(query);
      await expect(invalid.locator("body")).toContainText(warning);
      assert.equal(
        await invalid.evaluate(() => window.__roomLink.urls.length),
        0,
      );
      await invalid.close();
    }
    assert.deepEqual(errors, []);
    if (!built && !mobile) {
      const utility = await context.newPage();
      await utility.goto(origin);
      const checks = await utility.evaluate(async () => {
        const { normalizeRoomLink } = await import("/src/variant/roomLink.ts");
        const url = normalizeRoomLink(
          new URL(
            "https://static.example/ygopro/index.html?room=outer&spectate=1&embed=1#/match?room=inner%3Fname",
          ),
        );
        return {
          path: url.pathname,
          search: url.search,
          room: new URLSearchParams(url.hash.split("?")[1]).get("room"),
          buildUnchanged:
            normalizeRoomLink(
              new URL("https://static.example/?room=x&spectate=1#/build"),
            ) === undefined,
        };
      });
      assert.deepEqual(checks, {
        path: "/ygopro/index.html",
        search: "?embed=1",
        room: "inner?name",
        buildUnchanged: true,
      });
      // A failed initialization must reset progress and allow a same-document
      // retry. Two concurrent callers must await one shared database load.
      let failedLoads = 0;
      await utility.route(/\/cards\.cdb(?:\?|$)/, route => {
        failedLoads++;
        return route.fulfill({ contentType: "text/html", body: "<html>Error</html>" });
      });
      const failedInit = await utility.evaluate(async () => {
        const { initStore } = await import("/src/stores/initStore.ts");
        const { initSqlite } = await import("/src/ui/Layout/utils.ts");
        initStore.sqlite.progress = 0;
        let failed = false;
        try { await initSqlite(); } catch { failed = true; }
        return { failed, progress: initStore.sqlite.progress };
      });
      assert.deepEqual(failedInit, { failed: true, progress: 0 });
      assert.equal(failedLoads, 3);
      await utility.unroute(/\/cards\.cdb(?:\?|$)/);
      let goodLoads = 0;
      await utility.route(/\/cards\.cdb(?:\?|$)/, route => {
        goodLoads++;
        return route.continue();
      });
      const progress = await utility.evaluate(async () => {
        const { initStore } = await import("/src/stores/initStore.ts");
        const { initSqlite } = await import("/src/ui/Layout/utils.ts");
        await Promise.all([initSqlite(), initSqlite()]);
        return initStore.sqlite.progress;
      });
      assert.equal(progress, 1);
      assert.equal(goodLoads, 1);
      await utility.close();
    }
    results.push({
      mobile,
      encodedRoom: true,
      roleConfirmed: true,
      existingNicknamePreserved: true,
      runningRoom: true,
      coldSpectatorHistory: true,
      historyAnimationsPreserved: true,
      automaticMatchContinuation: true,
      boundedAnimations: !built,
      prefillOnly: true,
      invalidLinksBlocked: true,
    });
    await context.close();
  }
  console.log(JSON.stringify({ built, engine: safari ? "webkit" : "chromium", results }));
} finally {
  await browser?.close();
  if (built && vite)
    await new Promise((resolve) => vite.httpServer.close(resolve));
  else await vite?.close();
}
