// Real chat hook and native packets, with synthetic identities and no live server.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";

const fixture = `
import React from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "@/ui/Shared/chatHook";
import { initUIContainer, getUIContainer } from "@/container/compat";
import { chatStore, roomStore, matStore, SideStage, sideStore } from "@/stores";
import { settingStore } from "@/stores/settingStore";
import handle from "@/service/onSocketMessage";

initUIContainer({ ws: { readyState: 1, send() {} } });
const root = createRoot(document.getElementById("root"));
function packet(proto, payload) {
  const bytes = new Uint8Array(3 + payload.length);
  new DataView(bytes.buffer).setUint16(0, bytes.length - 2, true);
  bytes[2] = proto;
  bytes.set(payload, 3);
  return handle(getUIContainer(), { data: bytes.buffer });
}
function Probe({ duel }) {
  const { dialogs } = useChat(duel);
  return <pre id="dialogs">{JSON.stringify(dialogs)}</pre>;
}
window.__chat = {
  async setup({ duel, observer, swapped = false, second = false, tag = false, selfSeat = 0, mount = true }) {
    chatStore.reset();
    roomStore.reset();
    sideStore.stage = SideStage.NONE;
    roomStore.joined = true;
    roomStore.hostInfo = { mode: tag ? 2 : 1 };
    const names = ["Seat A", "Seat B", ...(tag ? ["Seat C", "Seat D"] : [])];
    for (let seat = 0; seat < names.length; seat++) {
      const payload = new Uint8Array(41);
      const view = new DataView(payload.buffer);
      for (let i = 0; i < names[seat].length; i++) view.setUint16(2 * i, names[seat].charCodeAt(i), true);
      payload[40] = seat;
      await packet(0x20, payload); // STOC_HS_PLAYER_ENTER
    }
    await packet(0x13, Uint8Array.of(observer ? 7 : selfSeat)); // STOC_TYPE_CHANGE
    matStore.selfType = observer ? 3 : second ? 2 : 1;
    matStore.observerSwapped = swapped;
    matStore.observerView = 0;
    settingStore.hidePlayerIds = false;
    if (mount) root.render(<Probe key={Math.random()} duel={duel} />);
  },
  mount(duel) { root.render(<Probe key={Math.random()} duel={duel} />); },
  // Several CHAT packets in one WebSocket frame.
  frame(lines) {
    const packets = lines.map(([sender, message]) => {
      const bytes = new Uint8Array(3 + 4 + 2 * message.length);
      const view = new DataView(bytes.buffer);
      view.setUint16(0, bytes.length - 2, true);
      bytes[2] = 0x19;
      view.setUint16(3, sender, true);
      for (let i = 0; i < message.length; i++) view.setUint16(5 + 2 * i, message.charCodeAt(i), true);
      return bytes;
    });
    const data = new Uint8Array(packets.reduce((total, item) => total + item.length, 0));
    let offset = 0;
    for (const item of packets) { data.set(item, offset); offset += item.length; }
    return handle(getUIContainer(), { data: data.buffer });
  },
  clear() { chatStore.reset(); },
  async send(sender, message) {
    const payload = new Uint8Array(4 + 2 * message.length);
    const view = new DataView(payload.buffer);
    view.setUint16(0, sender, true);
    for (let i = 0; i < message.length; i++) view.setUint16(2 + 2 * i, message.charCodeAt(i), true);
    await packet(0x19, payload);
  },
  flip() { matStore.observerView = 1 - matStore.observerView; },
  // STOC_WAITING_SIDE: the host has restored room seats as chat IDs.
  waitingSide: () => packet(0x08, new Uint8Array(0)),
  nextGame() { sideStore.stage = SideStage.DUEL_START; },
  mask(hidden) { settingStore.hidePlayerIds = hidden; },
};
`;

let browser, server;
try {
  const outDir = ".audit-tmp/chat-names-ui";
  await build({
    logLevel: "error",
    build: { outDir },
    plugins: [
      {
        name: "chat-names-fixture",
        enforce: "pre",
        transform(_code, id) {
          if (id.replaceAll("\\", "/").endsWith("/src/main.tsx"))
            return fixture;
        },
      },
    ],
  });
  server = await preview({
    build: { outDir },
    preview: { host: "127.0.0.1", port: 0 },
  });
  const origin = server.resolvedUrls.local[0];
  const edge =
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
      (existsSync(edge) ? edge : undefined),
  });
  for (const [width, height, touch] of [
    [1280, 800, false],
    [390, 844, true],
    [844, 390, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: touch,
      hasTouch: touch,
    });
    await context.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => window.__chat);
    const read = () => page.locator("#dialogs").textContent().then(JSON.parse);
    const setup = async (options) => {
      await page.evaluate((options) => window.__chat.setup(options), options);
      await page.waitForFunction(
        () => document.getElementById("dialogs")?.textContent === "[]",
      );
    };
    const send = async (sender, message, expectedName) => {
      const count = (await read()).length;
      await page.evaluate(
        async ({ sender, message }) => window.__chat.send(sender, message),
        { sender, message },
      );
      await page.waitForFunction(
        (count) =>
          JSON.parse(document.getElementById("dialogs").textContent).length ===
          count + 1,
        count,
      );
      const item = (await read()).at(-1);
      assert.equal(
        item.name,
        expectedName,
        `${width}px: sender ${sender}, ${message}`,
      );
      assert.equal(item.content.replace(/\0+$/, ""), message);
    };

    // Every received line stays, in order and once, however it arrived.
    const contents = async () =>
      (await read()).map((item) => [
        item.name,
        item.content.replace(/\0+$/, ""),
      ]);
    const waitForLines = (count) =>
      page.waitForFunction(
        (count) =>
          JSON.parse(document.getElementById("dialogs").textContent).length >=
          count,
        count,
        { timeout: 5000 },
      );
    const lines = (...items) => items.map((text) => [8, text]);
    const named = (items) => items.map(([, text]) => ["System", text]);
    await page.evaluate(() =>
      window.__chat.setup({ duel: false, mount: false }),
    );
    const beforeMount = [...lines("welcome", "record"), [1, "before mount"]];
    for (const [sender, text] of beforeMount)
      await page.evaluate(
        ({ sender, text }) => window.__chat.send(sender, text),
        { sender, text },
      );
    await page.evaluate(() => window.__chat.mount(false));
    await waitForLines(3).catch(() => {});
    assert.deepEqual(
      await contents(),
      [["System", "welcome"], ["System", "record"], ["Seat B", "before mount"]],
      `${width}px: lines received before the chat mounted`,
    );
    await page.evaluate(() => window.__chat.mount(false));
    await waitForLines(3).catch(() => {});
    assert.equal(
      (await read()).length,
      3,
      `${width}px: a remount (page switch) must not repeat lines`,
    );
    await page.evaluate(() => window.__chat.clear());
    await page.waitForFunction(
      () => document.getElementById("dialogs").textContent === "[]",
    );
    const sameFrame = lines("frame 1", "frame 2", "frame 3", "frame 4");
    await page.evaluate((items) => window.__chat.frame(items), sameFrame);
    await waitForLines(4).catch(() => {});
    assert.deepEqual(
      await contents(),
      named(sameFrame),
      `${width}px: several CHAT packets in one frame`,
    );
    await page.evaluate(() => window.__chat.clear());
    const separate = lines("task 1", "task 2", "task 3");
    for (const [sender, text] of separate)
      await page.evaluate(
        ({ sender, text }) => {
          window.__chat.send(sender, text);
        },
        { sender, text },
      );
    await waitForLines(3).catch(() => {});
    assert.deepEqual(
      await contents(),
      named(separate),
      `${width}px: separate messages`,
    );
    await page.evaluate(() => window.__chat.clear());
    const repeated = lines("same line", "same line", "same line");
    for (const [sender, text] of repeated) {
      await page.evaluate(
        ({ sender, text }) => window.__chat.send(sender, text),
        { sender, text },
      );
      await page.waitForTimeout(50);
    }
    await waitForLines(3).catch(() => {});
    assert.deepEqual(
      await contents(),
      named(repeated),
      `${width}px: identical consecutive lines`,
    );

    // Room sender IDs are seats; duel sender IDs follow the Core's first/second order.
    for (const observer of [false, true]) {
      await setup({ duel: false, observer, tag: true });
      for (const [sender, name] of [
        "Seat A",
        "Seat B",
        "Seat C",
        "Seat D",
      ].entries())
        await send(sender, `lobby ${sender}`, name);
    }
    for (const selfSeat of [0, 1]) {
      for (const second of [false, true]) {
        await setup({ duel: true, observer: false, second, selfSeat });
        const names =
          selfSeat === 0
            ? second
              ? ["Seat B", "Seat A"]
              : ["Seat A", "Seat B"]
            : second
            ? ["Seat A", "Seat B"]
            : ["Seat B", "Seat A"];
        await send(0, "duelist first", names[0]);
        await send(1, "duelist second", names[1]);
      }
    }
    for (let selfSeat = 0; selfSeat < 4; selfSeat++) {
      for (const second of [false, true]) {
        await setup({
          duel: true,
          observer: false,
          second,
          tag: true,
          selfSeat,
        });
        const swapped = selfSeat < 2 === second;
        const names = swapped
          ? ["Seat C", "Seat D", "Seat A", "Seat B"]
          : ["Seat A", "Seat B", "Seat C", "Seat D"];
        for (let sender = 0; sender < 4; sender++)
          await send(sender, `tag duelist ${sender}`, names[sender]);
      }
    }
    for (const tag of [false, true]) {
      for (const swapped of [false, true]) {
        await setup({ duel: true, observer: true, swapped, tag });
        const names = tag
          ? swapped
            ? ["Seat C", "Seat D", "Seat A", "Seat B"]
            : ["Seat A", "Seat B", "Seat C", "Seat D"]
          : swapped
          ? ["Seat B", "Seat A"]
          : ["Seat A", "Seat B"];
        for (let sender = 0; sender < names.length; sender++)
          await send(sender, `observer ${sender}`, names[sender]);
        const before = (await read()).map((item) => item.name);
        await page.evaluate(() => window.__chat.flip());
        await send(0, "after view flip", names[0]);
        assert.deepEqual(
          (await read()).slice(0, -1).map((item) => item.name),
          before,
        );
        await page.evaluate(() => window.__chat.mask(true));
        await page.waitForFunction(() =>
          JSON.parse(document.getElementById("dialogs").textContent).every(
            (item) => item.name === "********",
          ),
        );
        await send(8, "server notice", "System");
        assert.equal((await read()).at(-1).isServer, true);
        await page.evaluate(() => window.__chat.mask(false));
        await page.waitForFunction(
          () =>
            JSON.parse(document.getElementById("dialogs").textContent)[0]
              .name !== "********",
        );
        // Native STOC_CHAT masks anonymous/unknown sources; it never invents a seat.
        await send(9, "Watcher: hello", "********");
        await send(10, "anonymous message", "********");
        await send(20, "unknown source", "********");
        await send(11, "[Server]: colored notice", "System");
        // Between games a spectator keeps the duel chat open, but the host
        // sends room seats again, as YGOPro's ChatLocalPlayer expects.
        await page.evaluate(() => window.__chat.waitingSide());
        const seats = tag
          ? ["Seat A", "Seat B", "Seat C", "Seat D"]
          : ["Seat A", "Seat B"];
        for (let sender = 0; sender < seats.length; sender++)
          await send(sender, `siding ${sender}`, seats[sender]);
        await page.evaluate(() => window.__chat.nextGame());
        await send(0, "next game", names[0]);
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${width}x${height}: lobby, both duel orders, spectator seat/team swaps, chat while siding, view flip, ID masking, server/observer messages`,
    );
    await context.close();
  }
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
