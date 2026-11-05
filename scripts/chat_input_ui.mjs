// Synthetic room/duel and visual-viewport keyboard; no production connection.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";

const before = process.argv.includes("--capture-before");
const folder = `.audit-tmp/chat-input-ui/${before ? "before" : "after"}`;
const outDir = `${folder}/web-dist`;
const fixture = `
import { initUIContainer as initChatFixture } from "@/container/compat";
import { roomStore as chatRoom, matStore as chatMat, sideStore as chatSide, SideStage as chatSideStage, RoomStage as chatRoomStage } from "@/stores";
import { settingStore as chatSettings } from "@/stores/settingStore";
window.__chatTest = {
  sent: [],
  enter(mode, side) {
    initChatFixture({signal:new AbortController().signal, ws:{readyState:1,send(data){window.__chatTest.sent.push(Array.from(data));}}, cancelled:false, isClosed:false, close(){}});
    chatRoom.reset(); chatRoom.joined = true;
    chatSettings.controlPanelSide = side;
    chatMat.initInfo.me.life = 8000; chatMat.initInfo.op.life = 8000;
    chatMat.selfType = 1; chatMat.currentPlayer = 0;
    chatRoom.players[0] = {name:"ChatFixture",state:0,isMe:true};
    chatRoom.players[1] = {name:"Opponent",state:0,isMe:false};
    chatRoom.stage = mode === "duel" ? chatRoomStage.DUEL_START : chatRoomStage.WAITING;
    chatSide.stage = chatSideStage.NONE;
    if (mode === "side") {
      chatSide.setSideDeck({name:"Fixture",main:Array(40).fill(69247929),extra:[],side:[]});
      chatSide.stage = chatSideStage.SIDE_CHANGING;
    }
    location.hash = "#/" + mode;
  }
};`;
let browser, server;
const report = [], failures = [];
try {
  mkdirSync(folder, { recursive: true });
  if (!process.argv.includes("--built")) await build({
    logLevel: "warn", build: { outDir },
    plugins: [{ name: "chat-input-fixture", enforce: "pre", transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/main.tsx")) return code + fixture;
    } }],
  });
  execFileSync(process.execPath, ["scripts/copy_assets.mjs", outDir], { stdio: "inherit" });
  server = await preview({ build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || (existsSync(edge) ? edge : undefined) });
  const profiles = [
    ["phone-portrait", 390, 844, 330, 100],
    ["phone-landscape", 844, 390, 160, 32],
    ["small-landscape", 568, 320, 140, 24],
    ["ipad-portrait", 820, 1180, 620, 80],
    ["ipad-landscape", 1180, 820, 370, 48],
  ];
  for (const [name, width, height, keyboardHeight, offset] of profiles) {
    for (const mode of ["duel", "waitroom", "side"]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        const viewport = new EventTarget();
        Object.assign(viewport, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
        Object.defineProperty(window, "visualViewport", { value: viewport });
        window.__keyboard = (height, offsetTop) => {
          Object.assign(viewport, { height, offsetTop });
          viewport.dispatchEvent(new Event("resize"));
          viewport.dispatchEvent(new Event("scroll"));
        };
      });
      await context.route("**/*", route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${origin}/?lang=zh#/`, { waitUntil: "domcontentloaded" });
      try {
        await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 60000 });
      } catch (error) {
        await page.screenshot({path: `${folder}/load-failure.png`});
        console.error(await page.locator("body").innerText(), errors);
        throw error;
      }
      await page.evaluate(({ mode, side }) => window.__chatTest.enter(mode, side), { mode, side: name.includes("ipad") ? "right" : "left" });
      try {
        await page.getByTestId(mode === "duel" ? (width > height ? "duel-chat-tab" : "duel-chat") : mode === "side" ? "side-chat" : "waitroom-chat-toggle").click();
      } catch (error) {
        await page.screenshot({path: `${folder}/open-failure.png`});
        console.error(await page.locator("body").innerText(), errors, page.url());
        throw error;
      }
      const panel = page.getByTestId(mode === "duel" ? "duel-chat-panel" : mode === "side" ? "side-chat-panel" : "waitroom-chat-panel");
      const input = panel.locator("textarea");
      await expect(input).toBeVisible();
      await input.fill("draft ".repeat(80));
      await input.focus();
      await page.evaluate(({ keyboardHeight, offset }) => window.__keyboard(keyboardHeight, offset), { keyboardHeight, offset });
      await page.waitForTimeout(350);
      const metrics = await input.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const button = element.closest('[data-testid="chat-composer"]')?.querySelector("button") ?? element.parentElement.querySelector("button");
        const send = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, height: rect.height, sendTop: send.top, sendBottom: send.bottom, scroll: element.scrollHeight, client: element.clientHeight, scrollTop: element.scrollTop };
      });
      const item = { name, mode, ...metrics, errors };
      report.push(item);
      await page.screenshot({ path: `${folder}/${name}-${mode}.png` });
      {
        try {
          assert.ok(metrics.top >= offset - 1 && metrics.bottom <= offset + keyboardHeight + 1, `${name}/${mode}: input must fit above keyboard ${JSON.stringify(metrics)}`);
          assert.ok(metrics.height <= 90, "Long drafts must scroll within at most three lines");
          assert.ok(Math.abs(metrics.bottom - metrics.sendBottom) <= 8, "Send arrow aligns with the last input line");
          assert.deepEqual(errors, []);
          if (before) continue;
          await input.fill("composition");
          const sent = await page.evaluate(() => window.__chatTest.sent.length);
          await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
          assert.equal(await input.inputValue(), "composition", "IME confirmation must keep the draft");
          assert.equal(await page.evaluate(() => window.__chatTest.sent.length), sent);
          await input.press("Shift+Enter");
          assert.ok((await input.inputValue()).includes("\n"), "Shift+Enter adds a newline");
          await input.press("Enter");
          await expect(input).toHaveValue("");
          assert.equal(await page.evaluate(() => window.__chatTest.sent.length), sent + 1);
          if (mode === "duel" && width > height) {
            await input.focus();
            await panel.getByTestId("duel-chat-close").click();
            await expect(input).toBeHidden();
            await page.getByTestId("duel-chat-tab").click();
          }
          await page.evaluate(({ height }) => window.__keyboard(height, 0), { height });
          await input.fill("kept after rotation");
          await page.setViewportSize({ width: height, height: width });
          await page.evaluate(() => window.__keyboard(innerHeight, 0));
          if (mode === "duel" && !(await page.locator("textarea:visible").count())) {
            await page.getByTestId(height > width ? "duel-chat-tab" : "duel-chat").click();
          }
          await expect(page.locator("textarea:visible")).toHaveValue("kept after rotation");
        } catch (error) { failures.push(`${name}/${mode}: ${error.message}`); }
      }
      await context.close();
    }
  }
  writeFileSync(`${folder}/report.json`, JSON.stringify({ report, failures }, null, 2));
  console.log(JSON.stringify({ cases: report.length, failures }, null, 2));
  assert.equal(failures.length, 0);
} finally {
  await browser?.close();
  await server?.httpServer.close();
}
