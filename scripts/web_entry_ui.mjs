import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createServer, preview } from "vite";

const external = process.env.SMOKE_URL;
const built = process.argv.includes("--built") || !!external;
const folder = ".audit-tmp/round12-entry-ui";
mkdirSync(folder, { recursive: true });
let server, source, browser;
const reports = [];
try {
  if (!external) {
    server = built
      ? await preview({ preview: { host: "127.0.0.1", port: 0 } })
      : await createServer({ server: { host: "127.0.0.1", port: 0 } });
    if (!built) await server.listen();
  }
  const base = external
    ? external.replace(/\/?$/, "/")
    : server.resolvedUrls.local[0];
  const targetOrigin = new URL(base).origin;
  source = httpServer((_request, response) =>
    response.end('<!doctype html><button id="open">Open fixture</button>'),
  );
  await new Promise((resolve) => source.listen(0, "127.0.0.1", resolve));
  const sourceOrigin = `http://127.0.0.1:${source.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (process.platform === "win32"
        ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
        : undefined),
  });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 1000,
      isMobile: viewport.width < 1000,
    });
    await context.route("**/*", (route) =>
      [targetOrigin, sourceOrigin].includes(
        new URL(route.request().url()).origin,
      )
        ? route.continue()
        : route.abort(),
    );
    await context.route("**/duel-config.js", (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.__SRVPRO_DUEL_CONFIG__=${JSON.stringify({
          duelWebSocketUrl: "wss://entry-fixture.invalid/neos",
          deckImportOrigins: [sourceOrigin],
        })}`,
      }),
    );
    await context.addInitScript(
      ({ targetOrigin }) => {
        if (location.origin !== targetOrigin) return;
        if (!localStorage.getItem("joinFormSaved")) {
          localStorage.setItem(
            "joinFormSaved",
            JSON.stringify({
              version: 1,
              nickname: "Saved$old",
              roomName: "OldRoom$old",
            }),
          );
        }
        const wire = (window.__entryWire = { urls: [], packets: [] });
        const Native = window.WebSocket;
        class Socket {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          readyState = 0;
          constructor(url, protocols) {
            if (!String(url).startsWith("wss://entry-fixture.invalid/"))
              return new Native(url, protocols);
            wire.urls.push(url);
            window.__entrySocket = this;
            setTimeout(() => {
              this.readyState = 1;
              this.onopen?.(new Event("open"));
            }, 0);
          }
          emit(opcode, payload) {
            const bytes = Uint8Array.from([0, 0, opcode, ...payload]);
            new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
            this.onmessage?.(
              new MessageEvent("message", { data: bytes.buffer }),
            );
          }
          send(value) {
            const packet = [...new Uint8Array(value)];
            wire.packets.push(packet);
            if (packet[2] === 18)
              setTimeout(() => {
                const host = new Uint8Array(20),
                  view = new DataView(host.buffer);
                view.setUint32(0, 0x73ec4051, true);
                host[4] = 1;
                host[6] = 2;
                view.setInt32(12, 8000, true);
                host[16] = 5;
                host[17] = 1;
                view.setUint16(18, 180, true);
                this.emit(18, host);
                this.emit(19, [0]);
              }, 30);
            if (packet[2] === 33) setTimeout(() => this.emit(19, [7]), 0);
            if (packet[2] === 22) this.emit(25, [8, 0, 79, 75, 0, 0]);
          }
          close() {
            if (this.readyState === 3) return;
            this.readyState = 3;
            this.onclose?.(new CloseEvent("close", { code: 1000 }));
          }
        }
        window.WebSocket = Socket;
      },
      { targetOrigin },
    );
    const errors = [];
    context.on("page", (page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    const page = await context.newPage();
    const ready = async (p) =>
      expect(p.locator('main[data-ready="true"]')).toBeVisible({
        timeout: 90000,
      });
    await page.goto(`${base}?intent=regular&lang=zh`);
    await ready(page);
    await expect(page.locator("#player-nickname")).toHaveValue("Saved$old");
    await expect(page.locator("#room-name")).toHaveValue("OldRoom$old");
    assert.equal(await page.evaluate(() => window.__entryWire.urls.length), 0);
    assert.equal(new URL(page.url()).search, "?lang=zh");
    for (const [intent, hash] of [
      ["deck-editor", "#/build"],
      ["replay-list", "#/replays"],
    ]) {
      await page.goto(`${base}?intent=${intent}&lang=zh`);
      await ready(page);
      await expect.poll(() => new URL(page.url()).hash).toBe(hash);
      if (intent === "deck-editor")
        await expect(page.getByTestId("deck-name")).toBeVisible();
      assert.equal(
        await page.evaluate(() => window.__entryWire.urls.length),
        0,
      );
    }
    await page.goto(`${base}?intent=ladder&lang=zh`);
    await ready(page);
    await expect(page.getByTestId("waitroom-leave")).toBeVisible();
    assert.equal(await page.evaluate(() => window.__entryWire.urls.length), 1);
    await page.getByTestId("waitroom-leave").click();
    await expect(page.locator("#player-nickname")).toHaveValue("Saved$old");
    assert.equal(
      await page.evaluate(() => window.__entryWire.urls.length),
      1,
      "exit never rejoins TT",
    );
    await page.goto(`${base}?intent=spectate&room=PublicRoom&lang=zh`);
    await ready(page);
    await expect(page.getByTestId("waitroom-leave")).toBeVisible();
    await page.getByTestId("waitroom-leave").click();
    await expect(page.locator("#player-nickname")).toHaveValue("Saved$old");
    await expect(page.locator("#room-name")).toHaveValue("TT");
    await page.goto(`${base}#/match?room=LegacyRoom&spectate=1`);
    await ready(page);
    await expect(page.getByTestId("waitroom-leave")).toBeVisible();
    await page.getByTestId("waitroom-leave").click();
    await expect(page.locator("#player-nickname")).toHaveValue("Saved$old");
    await expect(page.locator("#room-name")).toHaveValue("TT");

    const parent = await context.newPage();
    await parent.goto(sourceOrigin);
    await parent.evaluate(
      ({ base, targetOrigin }) => {
        window.__results = [];
        let child;
        window.addEventListener("message", (event) => {
          const data = event.data;
          if (
            event.origin !== targetOrigin ||
            event.source !== child ||
            data?.channel !== "srvprotiantiweb:entry" ||
            data.request !== "fixture_nonce_12345678"
          )
            return;
          if (data.type === "ready")
            child.postMessage(
              {
                ...data,
                type: "payload",
                credentials: { username: "Bridge", password: "dummy" },
              },
              targetOrigin,
            );
          if (data.type === "result") window.__results.push(data);
        });
        document.querySelector("#open").onclick = () => {
          const url = new URL(base);
          url.searchParams.set("lang", "zh");
          url.hash =
            "/entry?" +
            new URLSearchParams({
              v: "1",
              intent: "spectate",
              room: "BridgeRoom",
              bridge: "1",
              origin: location.origin,
              request: "fixture_nonce_12345678",
            });
          child = window.open(url.href, "_blank");
        };
      },
      { base, targetOrigin },
    );
    const popupPromise = parent.waitForEvent("popup");
    await parent.locator("#open").click();
    const popup = await popupPromise;
    await ready(popup);
    await expect(popup.getByTestId("waitroom-leave")).toBeVisible();
    await expect
      .poll(() => parent.evaluate(() => window.__results.at(-1)?.status))
      .toBe("accepted");
    assert.ok(!popup.url().includes("dummy"));
    assert.equal(new URL(popup.url()).hash, "#/waitroom");
    assert.deepEqual(
      await popup.evaluate(() =>
        window.__entryWire.packets
          .filter((p) => [16, 18].includes(p[2]))
          .map(
            (p) =>
              new TextDecoder("utf-16le")
                .decode(Uint8Array.from(p.slice(p[2] === 16 ? 3 : 11)))
                .split("\0")[0],
          ),
      ),
      ["Bridge$dummy", "BridgeRoom"],
    );
    await popup.getByTestId("waitroom-leave").click();
    await expect(popup.locator("#player-nickname")).toHaveValue("Bridge$dummy");
    await expect(popup.locator("#room-name")).toHaveValue("");
    await popup.reload();
    await ready(popup);
    await expect(popup.locator("#player-nickname")).toHaveValue("Bridge$dummy");
    await expect(popup.locator("#room-name")).toHaveValue("");
    assert.equal(
      await popup.evaluate(() => window.__entryWire.urls.length),
      0,
      "reload after spectating must not reconnect",
    );
    await popup.screenshot({
      path: `${folder}/${viewport.width}.png`,
      fullPage: true,
    });
    // Open a fresh browser tab: durable identity survives closing the original.
    await popup.close();
    const reopened = await context.newPage();
    await reopened.goto(`${base}#/match`);
    await ready(reopened);
    await expect(reopened.locator("#player-nickname")).toHaveValue(
      "Bridge$dummy",
    );
    await expect(reopened.locator("#room-name")).toHaveValue("");
    await reopened.goto(
      `${base}#/entry?v=1&intent=spectate&room=Manual&autojoin=0`,
    );
    await ready(reopened);
    await expect(reopened.locator("#room-name")).toHaveValue("Manual");
    await expect(reopened.locator("#player-nickname")).toHaveValue(
      "observer from web",
    );
    await reopened.locator("#player-nickname").fill("Manual$dummy");
    await reopened.getByTestId("connect-submit").click();
    await expect(reopened.getByTestId("waitroom-leave")).toBeVisible();
    await reopened.getByTestId("waitroom-leave").click();
    await expect(reopened.locator("#player-nickname")).toHaveValue(
      "Manual$dummy",
    );
    await expect(reopened.locator("#room-name")).toHaveValue("");
    await reopened.goto(`${base}?intent=regular&password=dummy&lang=zh`);
    await ready(reopened);
    await expect(reopened.getByRole("alert")).toContainText("入口参数无效");
    assert.ok(!reopened.url().includes("dummy"));
    await reopened.goto(
      `${base}#/entry?v=1&intent=regular&bridge=1&origin=https%3A%2F%2Funtrusted.example&request=fixture_nonce_12345678`,
    );
    await ready(reopened);
    await expect(reopened.getByRole("alert")).toContainText("无法接收账号信息");
    assert.deepEqual(errors, []);
    reports.push({ viewport, passed: true, errors });
    console.log("PASS entry UI", viewport.width, viewport.height);
    await context.close();
  }
} finally {
  await browser?.close();
  if (typeof server?.close === "function") await server.close();
  else if (server?.httpServer)
    await new Promise((resolve) => server.httpServer.close(resolve));
  if (source) await new Promise((resolve) => source.close(resolve));
  writeFileSync(
    `${folder}/report.json`,
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), reports, fixtureOnly: true },
      null,
      2,
    ),
  );
}
