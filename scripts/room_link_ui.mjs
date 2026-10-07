import assert from "node:assert/strict";
import { existsSync } from "node:fs";

import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";

const built = process.argv.includes("--built");
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
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
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
            const running = decode(packet.slice(11)) === "M#TT,RANDOM#12345";
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
    async function open(query, outer = false) {
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${origin}${outer ? "?" : "#/match?"}${query}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 45000,
      });
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
      await utility.close();
    }
    results.push({
      mobile,
      encodedRoom: true,
      roleConfirmed: true,
      existingNicknamePreserved: true,
      runningRoom: true,
      prefillOnly: true,
      invalidLinksBlocked: true,
    });
    await context.close();
  }
  console.log(JSON.stringify({ built, results }));
} finally {
  await browser?.close();
  if (built && vite)
    await new Promise((resolve) => vite.httpServer.close(resolve));
  else await vite?.close();
}
