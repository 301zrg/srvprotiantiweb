// Synthetic transport with the real connect/reconnect path; no duel server access.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const folder = ".audit-tmp/side-recovery-ui";
const outDir = `${folder}/web-dist`;
const fixture = {
  main: [...Array(40).fill(69247929), ...Array(20).fill(43711255)],
  extra: Array(15).fill(44508094),
  side: [...Array(10).fill(89631139), ...Array(5).fill(44508094)],
};
const reports = [];
const failures = [];
let browser, server;
try {
  mkdirSync(folder, { recursive: true });
  if (!process.argv.includes("--built")) {
    await build({
      logLevel: "warn",
      build: { outDir },
      plugins: [{
        name: "side-recovery-fixture",
        enforce: "pre",
        transform(code, id) {
          if (!id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return;
          return code + `
            import { connectSrvpro as fixtureConnect } from "@/ui/Match/util";
            import { getUIContainer as fixtureContainer } from "@/container/compat";
            import { sendUpdateDeck as fixtureUpload } from "@/api";
            import { sideStore as fixtureSide, roomStore as fixtureRoom, RoomStage as FixtureRoomStage } from "@/stores";
            import { connectionStore as fixtureConnection } from "@/variant/connection";
            window.__sideRecovery = {
              connect() { return fixtureConnect({ip:"wss://side-recovery.invalid/neos",player:"SyntheticPlayer",passWd:"M#SyntheticSide"}); },
              beginSide(deck) {
                fixtureSide.setSideDeck(deck);
                fixtureUpload(fixtureContainer().conn, deck);
                fixtureContainer().conn.duelStarted = true;
                fixtureRoom.stage = FixtureRoomStage.DUEL_START;
              },
              state() { return {stage:fixtureSide.stage,joined:fixtureRoom.joined,connection:fixtureConnection.state,epoch:fixtureConnection.epoch,cancelled:fixtureContainer().conn.cancelled}; }
            };
          `;
        },
      }],
    });
    execFileSync(process.execPath, ["scripts/copy_assets.mjs", outDir], { stdio: "inherit" });
  }
  server = await preview({ build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined),
  });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile, hasTouch: mobile,
    });
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (/\.(jpg|webp|png)(\?|$)/i.test(route.request().url()))
        return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="59" height="86"><rect width="59" height="86" fill="#69562d"/></svg>' });
      return route.abort();
    });
    await context.addInitScript(() => {
      const mock = window.__sideTransport = { sockets: [], packets: [], submitted: false };
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 0;
        constructor(url) {
          if (!String(url).startsWith("wss://side-recovery.invalid/")) throw Error("Unexpected network socket");
          this.id = mock.sockets.length;
          mock.sockets.push(this);
          setTimeout(() => { this.readyState = 1; this.onopen?.(new Event("open")); }, 0);
        }
        emit(opcode, payload = []) {
          const bytes = Uint8Array.from([0, 0, opcode, ...payload]);
          new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
          this.onmessage?.(new MessageEvent("message", { data: bytes.buffer }));
        }
        chat(text) {
          const bytes = new Uint8Array(2 + (text.length + 1) * 2), view = new DataView(bytes.buffer);
          view.setUint16(0, 8, true);
          for (let i = 0; i < text.length; i++) view.setUint16(2 + i * 2, text.charCodeAt(i), true);
          this.emit(25, bytes);
        }
        send(value) {
          if (this.readyState !== 1) throw Error("Sending through closed socket");
          const packet = [...new Uint8Array(value)];
          mock.packets.push({ socket: this.id, bytes: packet });
          if (packet[2] === 18) setTimeout(() => {
            if (this.id) this.chat("You will be reconnected to your previous game. Please pick your previous deck.");
            const host = new Uint8Array(20), view = new DataView(host.buffer);
            view.setUint32(0, 0x73ec4051, true);
            host[4] = 1; host[5] = 1; host[6] = 2;
            view.setInt32(12, 8000, true); host[16] = 5; host[17] = 1;
            view.setUint16(18, 180, true);
            this.emit(18, host); this.emit(19, [0]);
          }, 20);
          if (packet[2] === 2) {
            this.uploads = (this.uploads || 0) + 1;
            if (this.id === 0 && this.uploads > 1) mock.submitted = true;
            // SRVPro consumes the first G1 upload as recovery authentication.
            if (this.uploads === 1) setTimeout(() => {
              this.emit(21);
              if (!mock.submitted) this.emit(7);
              this.chat("SyntheticPlayer reconnected to the game");
            }, 20);
            else mock.submitted = true;
          }
        }
        close() {
          if (this.readyState === 3) return;
          this.readyState = 3;
          this.onclose?.(new CloseEvent("close", { code: 1006, wasClean: false }));
        }
      }
      window.WebSocket = MockWebSocket;
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let realSockets = 0;
    page.on("websocket", () => realSockets++);
    const deckSnapshot = () => page.evaluate(() => Object.fromEntries(["main", "extra", "side"].map((type) => [type,
      Array.from(document.querySelectorAll(`[data-testid="deck-zone-${type}"] [data-testid="deck-card"]`), (card) => +card.dataset.cardCode),
    ])));
    const geometry = () => page.getByTestId("side-scroll-area").evaluate((element) => {
      const card = element.querySelector('[data-testid="deck-card"]');
      // Compact layouts move chat into an overlay panel, so there may be no column.
      const sidebar = document.querySelector('[data-testid="waitroom-chat"]')?.parentElement;
      return { top: element.scrollTop, width: element.clientWidth, height: element.clientHeight,
        cardWidth: card.getBoundingClientRect().width, cardHeight: card.getBoundingClientRect().height,
        sidebarWidth: sidebar ? sidebar.getBoundingClientRect().width : null,
        sidebarBasis: sidebar ? getComputedStyle(sidebar).flexBasis : null,
        sidebarVariable: sidebar ? getComputedStyle(sidebar).getPropertyValue("--sider-width") : null };
    });
    const uploads = () => page.evaluate(() => window.__sideTransport.packets.filter(({ bytes }) => bytes[2] === 2));
    async function move(source, id) {
      const wrapper = page.getByTestId(`deck-zone-${source}`).locator(`[data-card-code="${id}"]`).last().locator("..");
      if (mobile) {
        const control = wrapper.getByTestId("deck-card-move");
        await control.scrollIntoViewIfNeeded(); await control.tap();
      } else await wrapper.locator("button:visible").first().click();
    }
    for (const submitted of [false, true]) {
      console.log(`Side real recovery ${mobile ? "mobile" : "desktop"} / ${submitted ? "submitted" : "editing"}`);
      await page.goto(`${origin}?lang=zh&side-case=${submitted ? "submitted" : "editing"}#/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      await page.evaluate(() => window.__sideRecovery.connect());
      await expect.poll(() => page.evaluate(() => window.__sideRecovery.state().joined)).toBe(true);
      await page.evaluate((deck) => window.__sideRecovery.beginSide(deck), fixture);
      await expect.poll(() => page.evaluate(() => window.__sideRecovery.state().stage)).toBe(1);
      await page.evaluate(() => { location.hash = "#/side"; });
      await expect(page.getByTestId("side-confirm")).toBeEnabled();
      await move("main", 69247929); await move("side", 89631139);
      const changed = await deckSnapshot();
      assert.notDeepEqual(changed, fixture);
      const beforeChat = await geometry();
      const longNotice = 'Synthetic server notice ' + 'long-message-'.repeat(80);
      await page.evaluate((text) => window.__sideTransport.sockets[0].chat(text), longNotice);
      // Compact layouts keep chat in a closed overlay; the unread badge proves delivery.
      if (await page.getByTestId("side-chat").count())
        await expect(page.locator(".ant-badge", { has: page.getByTestId("side-chat") }).locator(".ant-badge-count")).toBeVisible();
      else await expect(page.getByTestId('waitroom-chat')).toContainText(longNotice);
      assert.deepEqual(await geometry(), beforeChat, 'Chat text must not squeeze the Side editor');
      if (submitted) await page.getByTestId("side-confirm").click();
      await page.getByTestId("side-scroll-area").evaluate((element) => { element.scrollTop = 120; });
      const before = await geometry(), packetsBefore = await uploads();
      assert.equal(packetsBefore.length, submitted ? 2 : 1);
      await page.evaluate(() => window.__sideTransport.sockets[0].close());
      await expect.poll(() => page.evaluate(() => window.__sideTransport.sockets.length)).toBe(2);
      await expect.poll(() => page.evaluate(() => window.__sideRecovery.state().connection), { timeout: 15000 }).toBe("connected");
      await expect(page.getByTestId("side-page")).toBeVisible();
      await expect.poll(() => page.url()).toMatch(/#\/side$/);
      const recoveredDeck = await deckSnapshot(), after = await geometry();
      const caseName = `${mobile ? "mobile" : "desktop"}/${submitted ? "submitted" : "editing"}`;
      for (const [label, actual, expected] of [["draft", recoveredDeck, changed], ["geometry", after, before]]) {
        try { assert.deepEqual(actual, expected); }
        catch { failures.push(`${caseName}: ${label} changed after recovery`); }
      }
      await page.screenshot({ path: `${folder}/${mobile ? "mobile" : "desktop"}-${submitted ? "submitted" : "editing"}-recovered.png` });
      const afterRecovery = await uploads();
      assert.equal(afterRecovery.length, packetsBefore.length + 1);
      assert.equal(afterRecovery.at(-1).socket, 1);
      assert.deepEqual(afterRecovery.at(-1).bytes, packetsBefore[0].bytes);
      if (submitted) {
        await expect(page.getByTestId("side-confirm")).toBeDisabled();
        assert.equal(await page.evaluate(() => window.__sideRecovery.state().stage), 2);
      } else {
        await expect(page.getByTestId("side-confirm")).toBeEnabled();
        assert.equal(await page.evaluate(() => window.__sideRecovery.state().stage), 1);
        // This also detects a Side callback retaining the previous UI container.
        await page.getByTestId("side-confirm").click();
        await expect(page.getByTestId("side-confirm")).toBeDisabled();
        const final = await uploads();
        assert.equal(final.length, afterRecovery.length + 1);
        assert.equal(final.at(-1).socket, 1);
        if (JSON.stringify(recoveredDeck) === JSON.stringify(changed))
          assert.notDeepEqual(final.at(-1).bytes, packetsBefore[0].bytes);
      }
      assert.equal(realSockets, 0);
      assert.deepEqual(errors, []);
      reports.push({ mobile, submitted, before, after, draftPreserved: JSON.stringify(recoveredDeck) === JSON.stringify(changed), recoveryUploadOnly: true, confirmUsesNewSocket: true, route: "side", realSockets });
      await page.screenshot({ path: `${folder}/${mobile ? "mobile" : "desktop"}-${submitted ? "submitted" : "editing"}.png` });
    }
    await context.close();
  }
  writeFileSync(`${folder}/metrics.json`, JSON.stringify({ reports, failures }, null, 2));
  console.log(JSON.stringify({ reports, failures, realPhoneTested: false }));
  assert.deepEqual(failures, []);
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
