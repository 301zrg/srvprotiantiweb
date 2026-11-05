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
import { chatStore as chatLines } from "@/stores";
import { noteChatArrival as chatArrival } from "@/variant/quickCommands";
window.__chatTest = {
  sent: [],
  arrive(player) { chatArrival(window.__chatTest.conn, Uint8Array.of(player, 0)); },
  display(player, message) {
    chatLines.receive(player, message);
  },
  enter(mode, side) {
    window.__chatTest.conn = {signal:new AbortController().signal, ws:{readyState:1,send(data){window.__chatTest.sent.push(Array.from(data));}}, cancelled:false, isClosed:false, close(){}};
    initChatFixture(window.__chatTest.conn);
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
          assert.ok(metrics.scroll - metrics.client - metrics.scrollTop <= 1,
            "The typed end of the draft must remain visible after the keyboard shrinks the input");
          assert.ok(Math.abs(metrics.bottom - metrics.sendBottom) <= 8, "Send arrow aligns with the last input line");
          assert.deepEqual(errors, []);
          if (before) continue;
          const commandId = mode === "duel" ? "duel-chat" : "waitroom-chat";
          const commands = panel.getByTestId(`${commandId}-commands`);
          const cramped = keyboardHeight < 300;
          assert.equal(await commands.count(), cramped ? 0 : 1, "Only a cramped keyboard view drops the command row");
          await input.evaluate(element => { element.setSelectionRange(2, 2); element.scrollTop = 0; });
          await page.evaluate(({ keyboardHeight, offset }) => window.__keyboard(keyboardHeight + 20, offset), { keyboardHeight, offset });
          await page.waitForTimeout(150);
          assert.equal(await input.evaluate(element => element.selectionStart), 2, "Resizing must preserve a middle edit");
          assert.equal(await input.evaluate(element => element.scrollTop), 0, "Resizing must not jump a middle edit to the end");
            await input.evaluate(element => { element.setSelectionRange(2, element.value.length, "backward"); element.scrollTop = 0; });
            await page.evaluate(({ keyboardHeight, offset }) => window.__keyboard(keyboardHeight + 40, offset), { keyboardHeight, offset });
            await page.waitForTimeout(150);
            assert.deepEqual(await input.evaluate(element => [element.selectionStart, element.selectionEnd]), [2, (await input.inputValue()).length], "Resizing must preserve the selected text");
            assert.equal(await input.evaluate(element => element.scrollTop), 0, "Resizing must not jump a backward selection to the end");
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
          await input.fill("draft stays");
          await expect(commands).toBeVisible();
          const tip = panel.getByTestId(`${commandId}-command-tip`);
          const roomname = panel.getByTestId(`${commandId}-command-roomname`);
          const row = await commands.evaluate(element => {
            const box = element.getBoundingClientRect();
            const buttons = [...element.querySelectorAll("button")].map(button => button.getBoundingClientRect());
            const composer = element.parentElement.querySelector('[data-testid="chat-composer"]').getBoundingClientRect();
            return { top: box.top, bottom: box.bottom, width: box.width, scroll: element.scrollWidth, client: element.clientWidth, composerTop: composer.top, heights: buttons.map(b => b.height), right: Math.max(...buttons.map(b => b.right)), boxRight: box.right };
          });
          report.push({ name, mode, row });
          assert.deepEqual(row.heights.map(value => value >= 44), [true, true], `Touch targets ${JSON.stringify(row)}`);
          assert.ok(row.scroll <= row.client + 1 && row.right <= row.boxRight + 1, `Both commands fit ${JSON.stringify(row)}`);
          assert.ok(row.bottom <= row.composerTop + 1, "The commands sit directly above the input");
          const decode = packet => new TextDecoder("utf-16le").decode(Uint8Array.from(packet.slice(3))).replace(/\0+$/, "");
          const sentCommands = async () => (await page.evaluate(() => window.__chatTest.sent)).map(decode);
          const beforeTip = (await sentCommands()).length;
          await tip.click();
          await expect(tip).toBeDisabled();
          await expect(roomname).toBeEnabled();
          assert.equal(await input.inputValue(), "draft stays", "A command must not touch the draft");
          await page.evaluate(() => { window.__chatTest.display(0, "player chat"); window.__chatTest.arrive(0); });
          await expect(tip).toBeDisabled();
          await tip.click({ force: true });
          assert.deepEqual((await sentCommands()).slice(beforeTip), ["/tip"], "A locked command sends once");
          await page.screenshot({ path: `${folder}/${name}-${mode}-locked.png` });
          await page.evaluate(() => window.__chatTest.arrive(8));
          await expect(tip).toBeEnabled();
          await roomname.click();
          await expect(roomname).toBeDisabled();
          await page.evaluate(() => window.__chatTest.arrive(14));
          await expect(roomname).toBeEnabled();
          assert.deepEqual((await sentCommands()).slice(beforeTip), ["/tip", "/roomname"]);
          // Host replies are not unique: a repeated line still has to appear.
          await page.evaluate(() => { window.__chatTest.display(8, "Tip: repeated"); });
          await expect(panel.getByText("Tip: repeated")).toHaveCount(1);
          await page.evaluate(() => { window.__chatTest.display(8, "Tip: repeated"); });
          await expect(panel.getByText("Tip: repeated")).toHaveCount(2);
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
