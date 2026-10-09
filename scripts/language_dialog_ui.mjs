import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const locales = { zh: "Chinese", en: "English", ja: "Japanese", ko: "Korean" };
const position = { zh: "正面攻击形式", en: "Face-Up Attack", ja: "表側攻撃表示", ko: "앞면 공격 표시" };
const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return [...bytes]; };
const reports = [], errors = [];
const buttonText = (locator, expected) => expect.poll(async () => (await locator.innerText()).replace(/\s+/g, "")).toBe(expected.replace(/\s+/g, ""));
let browser, server;
try {
  server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  const origin = server.resolvedUrls.local[0];
  const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mobile, hasTouch: mobile });
    await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await context.route("**/duel-config.js", route => route.fulfill({ contentType: "application/javascript", body: 'window.__SRVPRO_DUEL_CONFIG__={duelWebSocketUrl:"wss://language-test.invalid/neos"};' }));
    await context.addInitScript(() => {
      localStorage.setItem("language", "cn");
      window.__dialogPackets = [];
      class MockWebSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        readyState = 0;
        constructor() {
          window.__dialogSocket = this;
          setTimeout(() => { this.readyState = 1; this.onopen?.(new Event("open")); }, 0);
        }
        emit(opcode, payload) {
          const bytes = Uint8Array.from([0, 0, opcode, ...payload]);
          new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
          this.onmessage?.(new MessageEvent("message", { data: bytes.buffer }));
        }
        send(value) {
          const packet = [...new Uint8Array(value)]; window.__dialogPackets.push(packet);
          if (packet[2] === 18) setTimeout(() => {
            const host = new Uint8Array(20), view = new DataView(host.buffer);
            view.setUint32(0, 0x73ec4051, true); host[4] = 1; host[6] = 2;
            view.setInt32(12, 8000, true); host[16] = 5; host[17] = 1; view.setUint16(18, 180, true);
            this.emit(18, host); this.emit(19, [0]);
            for (const [seat, name] of [[0, "LanguageUser"], [1, "Opponent"]]) {
              const player = new Uint8Array(41), v = new DataView(player.buffer);
              [...name].forEach((char, i) => v.setUint16(i * 2, char.charCodeAt(0), true)); player[40] = seat;
              this.emit(32, player);
            }
          }, 20);
        }
        close() { this.readyState = 3; this.onclose?.(new CloseEvent("close", { code: 1000 })); }
      }
      window.WebSocket = MockWebSocket;
    });
    for (const lang of Object.keys(locales)) {
      const words = JSON.parse(readFileSync(`src/ui/I18N/Source/${locales[lang]}/translation.json`, "utf8")).ClientUI;
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}?lang=${lang}#/match`);
      await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
      await page.locator("#player-nickname").fill("LanguageUser"); await page.locator("#room-name").fill("LanguageRoom");
      await page.getByTestId("connect-submit").click();
      await expect(page.getByTestId("waitroom-deck-select")).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__dialogPackets.filter(p => p[2] === 22).map(p => new TextDecoder("utf-16le").decode(Uint8Array.from(p.slice(3))).split("\0")[0]))).toContain(lang === "zh" ? "/zh" : `/${lang}`);
      await page.evaluate(() => {
        const start = new Uint8Array(17), view = new DataView(start.buffer);
        view.setInt32(1, 8000, true); view.setInt32(5, 8000, true); view.setUint16(9, 40, true); view.setUint16(13, 40, true);
        window.__dialogSocket.emit(21, []); window.__dialogSocket.emit(1, [4, ...start]);
      });
      await expect(page.getByTestId("duel-menu")).toBeVisible({ timeout: 45000 });
      const emit = bytes => page.evaluate(bytes => window.__dialogSocket.emit(1, bytes), bytes);
      const responses = () => page.evaluate(() => window.__dialogPackets.filter(p => p[2] === 1).map(p => [...p.slice(3)]));
      await emit([19, 0, ...u32(89631139), 13]);
      await expect(page.getByTestId("duel-position-option").first()).toHaveText(position[lang]);
      await page.getByTestId("duel-position-option").first().click();
      await expect(page.getByTestId("duel-position-modal")).toBeHidden();
      assert.deepEqual((await responses()).at(-1), u32(1), "Position retains its exact native response");
      await emit([13, 0, ...u32(200)]);
      await buttonText(page.getByTestId("duel-yesno-yes"), words.Confirm);
      await buttonText(page.getByTestId("duel-yesno-no"), words.Cancel);
      await page.getByTestId("duel-yesno-no").click();
      await expect(page.getByTestId("duel-yesno-no")).toBeHidden();
      assert.deepEqual((await responses()).at(-1), u32(0), "Cancel retains its exact native response");
      await emit([142, 0, 2, ...u32(89631139), ...u32(0x40000100)]); // Native ISCODE declaration filter.
      await expect(page.getByTestId("duel-announce-search")).toHaveAttribute("placeholder", words.AnnouncePlaceholder);
      await expect(page.locator(".ant-modal-content").filter({ has: page.getByTestId("duel-announce-modal") }).locator(".ant-modal-title")).toHaveText(words.AnnounceTitle);
      const cardName = await page.evaluate(() => window.fetchCard(89631139).text.name);
      assert.ok(cardName, "Declaration uses the selected language's real card database");
      await page.getByTestId("duel-announce-search").fill(cardName);
      await page.getByTestId("duel-announce-search-submit").click();
      const choice = page.locator('[data-testid="duel-announce-card-option"][data-card-code="89631139"]');
      await expect(choice).toBeVisible(); await choice.locator("input").check();
      await buttonText(page.getByTestId("duel-announce-submit"), words.Confirm); await page.getByTestId("duel-announce-submit").click();
      await expect(page.getByTestId("duel-announce-modal")).toBeHidden();
      assert.deepEqual((await responses()).at(-1), u32(89631139), "Declaration retains its exact card ID");
      await emit([5, 0, 0]);
      await expect(page.getByTestId("duel-end-result")).toHaveText(words.Win);
      assert.equal(await page.evaluate(() => window.__dialogPackets.filter(p => p[2] === 18).length), 1, "Translation never reconnects the room");
      reports.push({ mobile, lang, translatedDialogs: 4, exactResponses: 3 });
      console.log(`PASS ${mobile ? "touch" : "desktop"} ${lang}: localized dialogs and exact native responses`);
      await page.close();
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ reports, productionConnections: 0, realIosTested: false }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
