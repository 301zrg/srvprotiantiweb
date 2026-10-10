import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";

import { chromium, expect } from "@playwright/test";
import { build, preview } from "vite";
import { startNginxGateway, startQuickTunnel, stopChild, waitForTcp } from "./tunnel_support.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoot = resolve(process.env.SRVPRO_TEST_ROOT || resolve(projectRoot, "../srvprotianti"));
const auditRoot = resolve(projectRoot, ".audit-tmp");
mkdirSync(auditRoot, { recursive: true });
const runtime = mkdtempSync(join(auditRoot, "local-wss-"));
const manualMode =
  process.argv.includes("--manual") || process.argv.includes("--manual-check");
const manualCheck = process.argv.includes("--manual-check");
const tunnelMode = process.argv.includes("--tunnel");
const roomLinksMode = process.argv.includes("--room-links");
const replayMode = process.argv.includes("--replays");
const languageMode = process.argv.includes("--languages");
const resumeMode = process.argv.includes("--resume");
const builtClient = process.argv.includes("--built");
const notes = [];
let serverProcess;
let previewServer;
let browser;
let nginxProcess;
let publicTunnel;

const copy = (source, target) => {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
};

const freePort = () =>
  new Promise((resolvePort, rejectPort) => {
    const probe = net.createServer();
    probe.once("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(() => resolvePort(port));
    });
  });

async function waitForTls(port, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode != null)
      throw new Error("Local SRVPro exited before WSS was ready");
    const ready = await new Promise((resolveReady) => {
      const socket = tls.connect({
        host: "127.0.0.1",
        port,
        rejectUnauthorized: false,
        timeout: 800,
      });
      socket.once("secureConnect", () => {
        socket.destroy();
        resolveReady(true);
      });
      socket.once("error", () => resolveReady(false));
      socket.once("timeout", () => {
        socket.destroy();
        resolveReady(false);
      });
    });
    if (ready) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Local SRVPro WSS listener did not start in time");
}

function prepareRuntime() {
  // Only public defaults and selected code/assets are copied. Private config.json is never read.
  copy(join(serverRoot, "data"), join(runtime, "data"));
  for (const name of ["deck_analysis", "ladder-core"]) {
    cpSync(join(serverRoot, "plugins", name), join(runtime, "plugins", name), {
      recursive: true,
      filter(source) {
        return basename(source).toLowerCase() !== "config.json";
      },
    });
  }
  copy(join(serverRoot, "data-manager"), join(runtime, "data-manager"));
  copy(
    join(serverRoot, "ygopro", "ygopro.exe"),
    join(runtime, "ygopro", "ygopro.exe"),
  );
  const environment = join(
    projectRoot,
    "public",
    "environment",
    "1103-201103-v1",
  );
  for (const name of ["cards.cdb", "strings.conf"]) {
    copy(join(environment, "zh-CN", name), join(runtime, "ygopro", name));
  }
  // Core reads scripts during a duel. A directory junction avoids copying
  // 13,000+ immutable Lua files for every local run; cleanup removes the link.
  symlinkSync(
    join(serverRoot, "ygopro", "script"),
    join(runtime, "ygopro", "script"),
    "junction",
  );
  copy(
    join(serverRoot, "ygopro", "expansions"),
    join(runtime, "ygopro", "expansions"),
  );
  copy(
    join(serverRoot, "ygopro", "gframe", "config.h"),
    join(runtime, "ygopro", "gframe", "config.h"),
  );
  copy(
    join(environment, "lflist.conf"),
    join(runtime, "ygopro", "lflist.conf"),
  );
}

try {
  console.log("Preparing isolated SRVPro runtime and core scripts...");
  prepareRuntime();
  console.log("Using localhost TLS certificate and starting SRVPro...");
  const certDir = join(runtime, "ssl");
  for (const name of ["cert.pem", "key.pem"]) {
    const source = join(auditRoot, "local-cert", name);
    if (!existsSync(source))
      throw new Error(
        `Local certificate missing: ${source}; run npm run test:local-wss`,
      );
    copy(source, join(certDir, name));
  }

  const [tcpPort, httpPort, httpsPort, wssPort] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  assert.equal(new Set([tcpPort, httpPort, httpsPort, wssPort]).size, 4);
  const testConfig = {
    port: tcpPort,
    version: 0x1362,
    // SRVPro config uses a zero-based banlist index; the YGOPro core sends
    // the banlist hash to clients in STOC_JOIN_GAME.
    hostinfo: { lflist: 0, rule: 0, duel_rule: 2 },
    modules: {
      // The integration runner also builds Vite and opens Edge; host memory
      // pressure must not turn a protocol regression into a "server full" result.
      max_mem_percentage: 100,
      mysql: {
        enabled: true,
        db: {
          type: "sqljs",
          database: null,
          autoSave: false,
          // The server entrypoint is loaded from serverRoot, so its core entity
          // classes also come from there. Match those exact module identities.
          entities: [
            join(serverRoot, "data-manager", "entities", "*.js").replaceAll(
              "\\",
              "/",
            ),
            join(runtime, "plugins", "ladder-core", "entities.js").replaceAll(
              "\\",
              "/",
            ),
          ],
        },
      },
      neos: {
        enabled: true,
        port: wssPort,
        trusted_proxy_header: "x-forwarded-for",
      },
      http: {
        port: httpPort,
        public_roomlist: roomLinksMode ? true : undefined,
        ssl: {
          enabled: !tunnelMode,
          port: httpsPort,
          cert: join(certDir, "cert.pem"),
          key: join(certDir, "key.pem"),
        },
      },
      tips: { enabled: false },
      dialogues: { enabled: false },
      ...(roomLinksMode
        ? { cloud_replay: { enabled: true, enable_halfway_watch: true } }
        : {}),
    },
  };
  mkdirSync(join(runtime, "config"), { recursive: true });
  writeFileSync(
    join(runtime, "config", "config.json"),
    JSON.stringify(testConfig, null, 2),
  );
  serverProcess = spawn(
    process.execPath,
    [join(serverRoot, "ygopro-server.js")],
    {
      cwd: runtime,
      env: { ...process.env, NODE_PATH: join(serverRoot, "node_modules") },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  const record = (chunk) => {
    notes.push(String(chunk));
    if (notes.length > 100) notes.shift();
  };
  serverProcess.stdout.on("data", record);
  serverProcess.stderr.on("data", record);
  if (tunnelMode) {
    await waitForTcp(wssPort, serverProcess, 90000);
    const gatewayPort = await freePort();
    nginxProcess = await startNginxGateway({ runtime, upstreamPort: wssPort, gatewayPort });
    publicTunnel = await startQuickTunnel({ runtime, gatewayPort });
    process.env.VITE_DUEL_WS_URL = publicTunnel.url;
    console.log("Isolated SRVPro is connected through a public Cloudflare Quick Tunnel...");
  } else {
    await waitForTls(wssPort);
    process.env.VITE_DUEL_WS_URL = `wss://127.0.0.1:${wssPort}/`;
    console.log("Local SRVPro WSS is listening...");
  }
  process.env.VITE_BASE_PATH = "/";
  if (manualMode) {
    console.log("Building manual browser preview...");
    const outDir = join(runtime, "web-dist");
    await build({ logLevel: "error", build: { outDir } });
    const assetsRoot = resolve(projectRoot, "neos-assets");
    cpSync(assetsRoot, join(outDir, "neos-assets"), {
      recursive: true,
      filter(source) {
        const parts = relative(assetsRoot, resolve(source)).split(sep);
        return (
          parts[0] !== "deck-cases" &&
          !(parts[0] === "sound" && parts[1] === "BGM")
        );
      },
    });
    previewServer = await preview({
      logLevel: "error",
      build: { outDir },
      preview: { host: "127.0.0.1", port: tunnelMode ? 4173 : 0, strictPort: tunnelMode },
    });
    const origin = previewServer.resolvedUrls.local[0];
    const edge =
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    browser = await chromium.launch({
      headless: manualCheck,
      executablePath:
        process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
        (process.platform === "win32" && existsSync(edge) ? edge : undefined),
      args: tunnelMode ? [] : ["--ignore-certificate-errors"],
    });
    const page = await browser.newPage({ ignoreHTTPSErrors: !tunnelMode });
    await page.addInitScript(() => localStorage.setItem("language", "cn"));
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator('main[data-ready="true"]')).toBeVisible({
      timeout: 45000,
    });
    if (manualCheck) {
      await page.getByRole("button", { name: "进入联机" }).click();
      await page.locator("#player-nickname").fill("ManualCheck");
      await page.locator("#room-name").fill("MANUAL-WSS-ROOM");
      await page.getByTestId("connect-submit").click();
      await expect(page.getByTestId("room-host-info")).toContainText(
        "LF: 0x73ec4051",
        { timeout: 25000 },
      );
      console.log(
        "Manual browser preview joined local SRVPro WSS successfully",
      );
    } else {
      console.log(`Manual browser is open at ${origin}`);
      console.log(`Local duel endpoint: wss://127.0.0.1:${wssPort}/`);
      console.log(
        "Use a second tab with a different nickname to test multiplayer. Press Ctrl+C here to stop and clean up.",
      );
      await new Promise((resolveStop) => {
        process.once("SIGINT", resolveStop);
        process.once("SIGTERM", resolveStop);
      });
    }
  } else {
    const outDir = join(runtime, "web-dist");
    if (builtClient) {
      if (!existsSync(join(projectRoot, "dist", "index.html")))
        throw new Error("--built requires an existing static build");
      console.log("Using existing static browser build...");
      copy(join(projectRoot, "dist"), outDir);
      writeFileSync(join(outDir, "duel-config.js"),
        `window.__SRVPRO_DUEL_CONFIG__=${JSON.stringify({ duelWebSocketUrl: process.env.VITE_DUEL_WS_URL })};\n`);
    } else {
      console.log("Building browser client...");
      await build({ logLevel: "error", build: { outDir } });
    }
    const assetsRoot = resolve(projectRoot, "neos-assets");
    cpSync(assetsRoot, join(outDir, "neos-assets"), {
      recursive: true,
      filter(source) {
        const parts = relative(assetsRoot, resolve(source)).split(sep);
        return (
          parts[0] !== "deck-cases" &&
          !(parts[0] === "sound" && parts[1] === "BGM")
        );
      },
    });
    previewServer = await preview({
      logLevel: "error",
      build: { outDir },
      preview: { host: "127.0.0.1", port: tunnelMode ? 4173 : 0, strictPort: tunnelMode },
    });
    const origin = previewServer.resolvedUrls.local[0];
    const edge =
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.PLAYWRIGHT_BROWSER_EXECUTABLE ||
        (process.platform === "win32" && existsSync(edge) ? edge : undefined),
      args: tunnelMode ? [] : ["--ignore-certificate-errors"],
    });
    const browserContext = await browser.newContext({ ignoreHTTPSErrors: !tunnelMode });
    const trackConnections = () => {
      window.__duelSockets = [];
      window.__networkSent = [];
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.__duelSockets.push(this);
        }
        send(data) {
          window.__networkSent.push([...new Uint8Array(data)]);
          return super.send(data);
        }
      };
    };
    if (resumeMode) await browserContext.addInitScript(trackConnections);
    const pageErrors = [];
    const pageTraces = new WeakMap();
    const capturedReplays = new WeakMap();
    const languageCommands = new WeakMap();
    async function verifyReplays(pages, minimum) {
      if (!replayMode) return;
      const originals = new Map(
        pages
          .flatMap((p) => capturedReplays.get(p) || [])
          .map((b) => [
            createHash("sha256").update(b).digest("hex"),
            b.toString("base64"),
          ]),
      );
      assert.ok(
        originals.size >= minimum,
        `Expected ${minimum} distinct native replay files`,
      );
      const stored = await pages[0].evaluate(async () => {
        const db = await new Promise((r, j) => {
          const q = indexedDB.open("srvpro-replays");
          q.onsuccess = () => r(q.result);
          q.onerror = () => j(q.error);
        });
        const tx = db.transaction(["blobs", "occurrences"], "readonly");
        const request = (q) =>
          new Promise((r, j) => {
            q.onsuccess = () => r(q.result);
            q.onerror = () => j(q.error);
          });
        const blobs = await request(tx.objectStore("blobs").getAll());
        const associations = await request(
          tx.objectStore("occurrences").getAll(),
        );
        db.close();
        return {
          files: await Promise.all(
            blobs.map(async (b) => ({
              hash: b.hash,
              bytes: btoa(
                String.fromCharCode(
                  ...new Uint8Array(await b.blob.arrayBuffer()),
                ),
              ),
            })),
          ),
          associations,
        };
      });
      for (const [hash, bytes] of originals)
        assert.equal(
          stored.files.find((f) => f.hash === hash)?.bytes,
          bytes,
          "Saved replay must equal the raw native WSS payload",
        );
      assert.ok(
        !JSON.stringify(stored.associations).includes("pass123") &&
          !JSON.stringify(stored.associations).includes("pass456"),
        "Capture metadata must not include credentials",
      );
      console.log(
        `Native WSS replay capture: ${originals.size} original files saved byte-for-byte`,
      );
    }
    async function joinRoom(nickname, roomName, mode, language = "cn") {
      const page = await browserContext.newPage();
      const clientTrace = [];
      pageTraces.set(page, clientTrace);
      capturedReplays.set(page, []);
      languageCommands.set(page, []);
      page.on("pageerror", (error) =>
        pageErrors.push(`${nickname}: ${error.message}`),
      );
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          clientTrace.push(`console ${message.type()}: ${message.text()}`);
      });
      page.on("websocket", (socket) => {
        let pending = Buffer.alloc(0);
        if (replayMode)
          socket.on("framereceived", (frame) => {
            if (typeof frame.payload === "string") return;
            pending = Buffer.concat([pending, Buffer.from(frame.payload)]);
            while (pending.length >= 3) {
              const size = pending.readUInt16LE(0);
              if (pending.length < size + 2) break;
              if (pending[2] === 0x17)
                capturedReplays
                  .get(page)
                  .push(Buffer.from(pending.subarray(3, size + 2)));
              pending = pending.subarray(size + 2);
            }
          });
        clientTrace.push(`websocket ${socket.url()}`);
        socket.on("framesent", (frame) => {
          if (typeof frame.payload === "string") return;
          const packet = Buffer.from(frame.payload);
          if (packet[2] === 0x16)
            languageCommands.get(page).push(
              packet.subarray(3).toString("utf16le").replace(/\0+$/, ""),
            );
        });
        socket.on("framesent", (frame) =>
          clientTrace.push(
            `sent ${Buffer.from(frame.payload)
              .subarray(0, 40)
              .toString("hex")}`,
          ),
        );
        socket.on("framereceived", (frame) =>
          clientTrace.push(
            `received ${Buffer.from(frame.payload)
              .subarray(0, 40)
              .toString("hex")}`,
          ),
        );
        socket.on("close", () => clientTrace.push("websocket closed"));
        socket.on("socketerror", (error) =>
          clientTrace.push(`websocket error: ${error}`),
        );
      });
      await page.addInitScript((language) => localStorage.setItem("language", language), language);
      await page.goto(origin + (languageMode ? "#/match" : ""), { waitUntil: "domcontentloaded" });
      if (!languageMode) {
        await expect(page.locator('main[data-ready="true"]')).toBeVisible({ timeout: 45000 });
        await page.getByRole("button", { name: "进入联机" }).click();
      }
      await expect(page.locator("#player-nickname")).toBeVisible({ timeout: 45000 });
      await page.locator("#player-nickname").fill(nickname);
      await page.locator("#room-name").fill(roomName);
      await page.getByTestId("connect-submit").click();
      try {
        const host = page.getByTestId("room-host-info");
        await expect(host).toBeVisible({ timeout: 25000 });
        await expect(host).toContainText(`Mode: ${mode}`);
        await expect(host).toContainText("LF: 0x73ec4051");
        await expect(host).toContainText("MR: 2");
      } catch (error) {
        console.error(
          `${nickname} browser text:`,
          (await page.locator("body").innerText()).slice(0, 1500),
        );
        console.error(
          `${nickname} browser trace:`,
          clientTrace.slice(-30).join("\n"),
        );
        console.error("Page errors:", pageErrors.join("; "));
        throw error;
      }
      return page;
    }
    async function startDuel(first, second, label) {
      try {
        const readyFirst = first.getByTestId("waitroom-ready-toggle");
        const readySecond = second.getByTestId("waitroom-ready-toggle");
        await expect(readyFirst).toBeVisible();
        await expect(readySecond).toBeVisible();
        for (const ready of [readyFirst, readySecond]) {
          // Joining and selecting a deck must not send UPDATE_DECK, which the
          // server-mode Core would otherwise treat as an implicit confirmation.
          await expect(ready).toHaveAttribute("data-player-ready", "false");
          await ready.click();
          await expect(ready).toHaveAttribute("data-player-ready", "true", {
            timeout: 10000,
          });
        }
        const start = first.getByTestId("waitroom-start");
        await expect(start).toBeEnabled({ timeout: 20000 });
        await start.click();
        await first.getByTestId("waitroom-mora-rock").click();
        await second.getByTestId("waitroom-mora-scissors").click();
        await first.getByTestId("waitroom-tp-first").click();
        await expect
          .poll(() => first.url(), { timeout: 30000 })
          .toMatch(/#\/duel/);
        await expect
          .poll(() => second.url(), { timeout: 30000 })
          .toMatch(/#\/duel/);
        await expect(
          first.getByTestId("duel-player-life").first(),
        ).toBeVisible();
        await expect(
          second.getByTestId("duel-player-life").first(),
        ).toBeVisible();
        console.log(
          `${label}: both browser clients reached live duel after deck ready, rock-paper-scissors and turn choice`,
        );
      } catch (error) {
        for (const [name, page] of [
          ["first", first],
          ["second", second],
        ]) {
          console.error(
            `${label} ${name} browser text:`,
            (await page.locator("body").innerText()).slice(0, 1600),
          );
          console.error(
            `${label} ${name} browser trace:`,
            pageTraces.get(page)?.slice(-30).join("\n"),
          );
        }
        console.error("Page errors:", pageErrors.join("; "));
        throw error;
      }
    }
    async function recoverPage(page, label, inDuel = true) {
      const before = await page.evaluate(() => window.__duelSockets.length);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        window.__duelSockets.at(-1).close();
      });
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => window.__duelSockets.length), before, "No background reconnect");
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      try {
        await expect.poll(() => page.evaluate(() => window.__duelSockets.length), { timeout: 15000 }).toBe(before + 1);
        await expect(page.getByTestId("connection-alert")).toHaveCount(0, { timeout: 25000 });
        if (inDuel) {
          await expect(page.getByTestId("duel-player-life").first()).toBeVisible();
          await expect.poll(() => page.locator('[data-testid="duel-card"][data-card-zone="HAND"]').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(5);
        }
      } catch(error) {
        console.error(label, (await page.locator("body").innerText()).slice(0, 1800));
        console.error(pageTraces.get(page)?.slice(-50).join("\n"));
        console.error("Page errors:", pageErrors.join("; "));
        throw error;
      }
      console.log(`PASS ${label}: foreground recovered one connection`);
    }
    async function nativeDeckReconnect(page) {
      const packets = await page.evaluate(() => window.__networkSent);
      const original = Buffer.from(packets.find((packet) => packet[2] === 2));
      const bodySize = 8 + 4 * (original.readUInt32LE(3) + original.readUInt32LE(7));
      const nativeDeck = Buffer.alloc(bodySize + 3);
      nativeDeck.writeUInt16LE(bodySize + 1);
      nativeDeck[2] = 2;
      original.copy(nativeDeck, 3, 3, 3 + bodySize);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
        window.__duelSockets.at(-1).close();
      });
      await page.waitForTimeout(1200);
      const native = net.connect({ host: "127.0.0.1", port: tcpPort });
      try {
        await new Promise((resolveRecovery, rejectRecovery) => {
          let pending = Buffer.alloc(0), joined = false, field = false;
          const timers = new Set();
          const timer = setTimeout(() => rejectRecovery(new Error("Native-format TCP reconnect did not restore the field")), 15000);
          const fail = (error) => { clearTimeout(timer); rejectRecovery(error); };
          native.once("error", fail);
          native.once("connect", () => {
            // Synthetic test identity and join already acknowledged by the
            // host. The reconnect deck itself uses the exact native format.
            for (const opcode of [0x10, 0x12])
              native.write(Buffer.from(packets.find((packet) => packet[2] === opcode)));
          });
          native.on("data", (data) => {
            pending = Buffer.concat([pending, data]);
            while (pending.length >= 3) {
              const size = pending.readUInt16LE(0) + 2;
              if (pending.length < size) break;
              const packet = pending.subarray(0, size);
              pending = pending.subarray(size);
              if (packet[2] === 0x12 && !joined) {
                joined = true;
                native.write(nativeDeck);
              }
              if (packet[2] === 0x02) fail(new Error("Host rejected the native-format reconnect deck"));
              if (packet[2] === 0x01 && packet[3] === 162) field = true;
              if (field && packet[2] === 0x18) {
                timers.add(packet[3]);
                if (timers.size === 2) { clearTimeout(timer); resolveRecovery(); }
              }
            }
          });
        });
        assert.deepEqual(original, nativeDeck, "G1 webpage upload matches native format byte-for-byte");
      } finally {
        native.destroy();
      }
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(page.getByTestId("connection-alert")).toHaveCount(0, { timeout: 25000 });
      await expect(page.getByTestId("duel-phase-select")).toBeEnabled({ timeout: 15000 });
      console.log("PASS Web -> native-format TCP -> Web reconnect: same frozen G1 deck, restored field and playable browser");
    }
    async function joinSpectator(roomName, running, options = {}) {
      const spectatorContext = options.mobile
        ? await browser.newContext({
            ignoreHTTPSErrors: !tunnelMode,
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
          })
        : browserContext;
      const page = await spectatorContext.newPage();
      if (resumeMode && options.mobile) await page.addInitScript(trackConnections);
      if (options.slow)
        await page.route(/\/assets\/Main-[^/]+\.js$/, async route => {
          await new Promise(resolve => setTimeout(resolve, 3000));
          await route.continue();
        });
      page.on("pageerror", (error) =>
        pageErrors.push(`Spectator: ${error.message}`),
      );
      const sent = [];
      page.on("websocket", (socket) =>
        socket.on("framesent", (frame) => {
          if (typeof frame.payload !== "string")
            sent.push(Buffer.from(frame.payload)[2]);
        }),
      );
      await page.addInitScript(() => localStorage.setItem("language", "cn"));
      const query = new URLSearchParams({ room: roomName, spectate: "1" });
      await page.goto(`${origin}#/match?${query}`, {
        waitUntil: "domcontentloaded",
      });
      if (running) {
        await expect(page.getByTestId("duel-switch-view")).toBeVisible({
          timeout: 30000,
        });
        await expect(page.getByTestId("duel-surrender")).toHaveCount(0);
        await expect.poll(
          () => page.locator('[data-testid="duel-card"][data-card-zone="HAND"]').count(),
          { timeout: 30000 },
        ).toBeGreaterThanOrEqual(10);
        await page.getByTestId("duel-switch-view").click();
        await expect(page.getByTestId("duel-switch-view")).toHaveAttribute(
          "data-view-controller",
          "1",
        );
        if (!options.keep) await page.getByTestId("duel-leave-spectating").click();
      } else {
        await expect(page.getByTestId("waitroom-role-toggle")).toHaveText(
          /加入决斗者/,
          { timeout: 30000 },
        );
        await expect(page.getByTestId("waitroom-ready-toggle")).toHaveCount(0);
        await page.getByRole("button", { name: "退出房间" }).click();
      }
      if (!options.keep)
        await expect(page.locator("#player-nickname")).toBeVisible();
      assert.equal(sent.filter((opcode) => opcode === 18).length, 1);
      assert.equal(sent.filter((opcode) => opcode === 33).length, 1);
      assert.ok(
        !sent.some((opcode) => [2, 34, 37].includes(opcode)),
        "Spectators must never upload decks, ready, or start",
      );
      if (!options.keep) {
        await page.close();
        if (options.mobile) await spectatorContext.close();
      }
      console.log(
        `Room link spectating passed: ${
          running ? "running" : "waiting"
        } ${roomName}`,
      );
      return page;
    }
    if (languageMode) {
      for (const [language, command, confirmation] of [
        ["cn", "/zh", "提示语言已切换"],
        ["en", "/en", "Message language switched"],
        ["ja", "/ja", "メッセージ言語を切り替えました"],
        ["ko", "/ko", "메시지 언어가 변경되었습니다"],
      ]) {
        const page = await joinRoom(`Language-${language}`, `LANGUAGE-${language}`, "Single", language);
        await expect(page.getByTestId("waitroom-chat-dialogs")).toContainText(confirmation, { timeout: 15000 });
        assert.deepEqual(languageCommands.get(page), [command], "One language command after each acknowledged join");
        await expect(page.getByTestId("waitroom-ready-toggle")).toHaveAttribute("aria-pressed", "false");
        await page.getByTestId("waitroom-leave").click();
        await expect(page.locator("#player-nickname")).toBeVisible({ timeout: 15000 });
        await page.locator("#room-name").fill(`LANGUAGE-REJOIN-${language}`);
        await page.getByTestId("connect-submit").click();
        await expect(page.getByTestId("room-host-info")).toBeVisible({ timeout: 25000 });
        await expect(page.getByTestId("waitroom-chat-dialogs")).toContainText(confirmation, { timeout: 15000 });
        assert.deepEqual(languageCommands.get(page), [command, command]);
        await expect(page.getByTestId("waitroom-ready-toggle")).toHaveAttribute("aria-pressed", "false");
        console.log(`PASS ${language}: ${command}, localized server reply and first rejoin, manual ready retained`);
        await page.close();
      }
    } else {
      const ordinaryA = await joinRoom("LocalWebA", "LOCAL-WSS-ROOM", "Single");
      if (roomLinksMode) await joinSpectator("LOCAL-WSS-ROOM", false);
      const ordinaryB = await joinRoom("LocalWebB", "LOCAL-WSS-ROOM", "Single");
      console.log(
        "Two browser clients joined the same ordinary room with 2011.3 banlist hash",
      );
      await startDuel(ordinaryA, ordinaryB, "Ordinary room");
      if (resumeMode) {
        const initial = await ordinaryA.evaluate(() => window.__networkSent.find(p => p[2] === 2));
        await recoverPage(ordinaryA, "Single native field restore");
        const uploads = await ordinaryA.evaluate(() => window.__networkSent.filter(p => p[2] === 2));
        assert.deepEqual(uploads, [initial, initial]);
        await expect(ordinaryA.getByTestId("duel-phase-select")).toBeEnabled({ timeout: 15000 });
        await nativeDeckReconnect(ordinaryA);
        const observer = await joinSpectator("LOCAL-WSS-ROOM", true, { keep: true, mobile: true });
        await recoverPage(observer, "Mobile observer history restore");
        assert.ok(!(await observer.evaluate(() => window.__networkSent)).some(p => [2,34,37].includes(p[2])));
        await observer.getByTestId("duel-leave-spectating").click();
        await expect(observer.locator("#player-nickname")).toHaveValue("");
        await expect(observer.locator("#room-name")).toHaveValue("");
        await observer.context().close();
      }
      if (roomLinksMode) await joinSpectator("LOCAL-WSS-ROOM", true);
      await ordinaryA.getByTestId("duel-surrender").click();
      await ordinaryA.getByTestId("duel-surrender-confirm").click();
      for (const page of [ordinaryA, ordinaryB]) {
        await expect(page.getByTestId("duel-end-modal")).toBeVisible({ timeout: 30000 });
        await page.locator(".ant-modal-footer button").last().click();
        await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/#\/match/);
      }
      await expect(ordinaryA.locator("#player-nickname")).toHaveValue("LocalWebA");
      await expect(ordinaryA.locator("#room-name")).toHaveValue("LOCAL-WSS-ROOM");
      await verifyReplays([ordinaryA, ordinaryB], 1);
      await ordinaryA.locator("#room-name").fill("LOCAL-REJOIN-ROOM");
      await ordinaryA.getByTestId("connect-submit").click();
      await expect(ordinaryA.getByTestId("room-host-info")).toBeVisible({ timeout: 25000 });
      console.log("First reconnect after a completed ordinary duel joined a new room");
      await ordinaryB.close();
      await ordinaryA.close();
      const ladderA = await joinRoom("TTWebA$pass123", "TT", "Match");
      const ladderB = await joinRoom("TTWebB$pass456", "TT", "Match");
      console.log(
        "Two browser clients entered TT ladder matching with 2011.3 banlist hash",
      );
      await startDuel(ladderA, ladderB, "TT ladder");
      let ladderRoomName, continuingSpectator;
      if (roomLinksMode) {
        const response = await fetch(`http://127.0.0.1:${httpPort}/api/getrooms`);
        assert.ok(response.ok);
        const { rooms } = await response.json();
        const room = rooms.find((room) =>
          room.roomname.startsWith("M#TT,RANDOM#"),
        );
        assert.ok(
          room,
          "Expected a concrete TT room in the local public room list",
        );
        ladderRoomName = room.roomname;
        await joinSpectator(room.roomname, true);
      }
      // Split the first two wins so the same live match must reach G3.
      async function surrender(page) {
        await page.getByTestId("duel-surrender").click();
        await page.getByTestId("duel-surrender-confirm").click();
      }
      async function sideAndStart(loser, other, label) {
        for (const page of [loser, other]) {
          await expect(page.getByTestId("duel-end-modal")).toBeVisible({ timeout: 30000 });
          await page.locator(".ant-modal-footer button").last().click();
          await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/#\/side/);
        }
        if (resumeMode && label === "TT G2") {
          const initial = await loser.evaluate(() => window.__networkSent.find(p => p[2] === 2));
          await loser.evaluate(() => {
            const deck = JSON.parse(sessionStorage.getItem("side_deck"));
            deck.main.reverse();
            sessionStorage.setItem("side_deck", JSON.stringify(deck));
          });
          await recoverPage(loser, "TT siding restore uses original G1 deck", false);
          await expect(loser.getByTestId("side-confirm")).toBeVisible();
          await expect(loser.getByTestId("side-confirm")).toBeEnabled();
          const uploads = await loser.evaluate(() => window.__networkSent.filter(p => p[2] === 2));
          assert.deepEqual(uploads, [initial, initial]);
        }
        if (resumeMode && label === "TT G3") {
          // A fresh-page recovery has no saved SideStage. SRVPro reissues
          // CHANGE_SIDE after the player manually authenticates with G1.
          await loser.setViewportSize({ width: 390, height: 844 });
          await loser.reload({ waitUntil: "domcontentloaded" });
          await expect(loser.locator("#player-nickname")).toBeVisible({ timeout: 45000 });
          await loser.locator("#player-nickname").fill("TTWebB$pass456");
          await loser.locator("#room-name").fill("TT");
          await loser.getByTestId("connect-submit").click();
          await expect(loser.getByTestId("waitroom-ready-toggle")).toBeVisible({ timeout: 25000 });
          await loser.getByTestId("waitroom-ready-toggle").click();
          await expect(loser.getByTestId("side-page")).toBeVisible({ timeout: 15000 });
          await expect(loser.getByTestId("side-confirm")).toBeEnabled();
          console.log("PASS fresh-page TT siding reconnect opens an editable Side page");
        }
        const ownDeck = await loser.evaluate(() => sessionStorage.getItem("side_deck"));
        const otherDeck = await other.evaluate(() => sessionStorage.getItem("side_deck"));
        await loser.screenshot({ path: join(auditRoot, `tt-side-${label.replaceAll(" ", "-")}.png`) });
        await loser.getByTestId("side-confirm").click();
        if (resumeMode && label === "TT G2") {
          await expect(loser.getByTestId("side-confirm")).toBeDisabled();
          await recoverPage(loser, "TT submitted Side reconnect waits without resubmitting", false);
          await expect(loser.getByTestId("side-confirm")).toBeDisabled();
          const uploads = await loser.evaluate(() => window.__networkSent.filter(p => p[2] === 2));
          assert.equal(uploads.length, 4, "G1 + resume + manual Side + resume only");
          assert.deepEqual(uploads.at(-1), uploads[0]);
        }
        await other.bringToFront();
        assert.equal(await loser.evaluate(() => sessionStorage.getItem("side_deck")), ownDeck);
        assert.equal(await other.evaluate(() => sessionStorage.getItem("side_deck")), otherDeck);
        await other.getByTestId("side-confirm").click();
        await loser.getByTestId("side-tp-first").click();
        for (const page of [loser, other]) {
          await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/#\/duel/);
          await expect(page.getByTestId("duel-player-life").first()).toBeVisible();
        }
        console.log(`${label}: side decks submitted and both clients entered the next game`);
      }
      await surrender(ladderA);
      await sideAndStart(ladderA, ladderB, "TT G2");
      if (resumeMode) {
        const initial = await ladderA.evaluate(() => window.__networkSent.find(p => p[2] === 2));
        await recoverPage(ladderA, "TT G2 native field restore");
        const uploads = await ladderA.evaluate(() => window.__networkSent.filter(p => p[2] === 2));
        assert.deepEqual(uploads.at(-1), initial, "G2 reconnect sends G1, not Side deck");
        await expect(ladderA.getByTestId("duel-phase-select")).toBeEnabled({ timeout: 15000 });
      }
      if (roomLinksMode) {
        continuingSpectator = await joinSpectator(ladderRoomName, true, {
          keep: true,
          mobile: true,
          slow: true,
        });
        await expect(continuingSpectator.getByTestId("duel-end-modal")).toBeHidden();
        console.log("Cold mobile spectator caught up through G1 history to live TT G2");
        const handsBefore = await continuingSpectator.locator('[data-testid="duel-card"][data-card-zone="HAND"]').count();
        await expect(ladderA.getByTestId("duel-phase-select")).toBeEnabled({ timeout: 20000 });
        await ladderA.getByTestId("duel-phase-select").click();
        await ladderA.getByTestId("duel-phase-end").click();
        await expect.poll(
          () => continuingSpectator.locator('[data-testid="duel-card"][data-card-zone="HAND"]').count(),
          { timeout: 30000 },
        ).toBeGreaterThan(handsBefore);
        console.log("Mobile spectator received a new live turn and draw after history catch-up");
      }
      await surrender(ladderB);
      if (continuingSpectator) {
        await expect(continuingSpectator.getByTestId("duel-observer-wait")).toBeVisible({ timeout: 30000 });
        await expect(continuingSpectator.getByTestId("duel-end-modal")).toBeHidden();
      }
      await sideAndStart(ladderB, ladderA, "TT G3");
      if (continuingSpectator) {
        await expect(continuingSpectator.getByTestId("duel-observer-wait")).toHaveCount(0);
        await expect.poll(
          () => continuingSpectator.locator('[data-testid="duel-card"][data-card-zone="HAND"]').count(),
          { timeout: 30000 },
        ).toBeGreaterThanOrEqual(10);
        for (const life of await continuingSpectator.getByTestId("duel-player-life").all())
          await expect(life).toHaveAttribute("data-life", "8000");
        console.log("Mobile spectator followed live win, side decking and TT G3 automatically");
      }
      await surrender(ladderA);
      for (const page of [ladderA, ladderB]) {
        await expect(page.getByTestId("duel-end-modal")).toBeVisible({ timeout: 30000 });
        await page.locator(".ant-modal-footer button").last().click();
        await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/#\/match/);
      }
      await expect(ladderA.locator("#player-nickname")).toHaveValue("TTWebA$pass123");
      await verifyReplays([ladderA, ladderB], 3);
      if (continuingSpectator) {
        await expect(continuingSpectator.locator("#player-nickname")).toBeVisible({ timeout: 30000 });
        await continuingSpectator.context().close();
      }
      console.log("TT Match completed G1-G3, both side phases and exit with retained nickname/password");
      await ladderB.close();
      await ladderA.close();
    }
    assert.equal(pageErrors.length, 0, pageErrors.join("; "));
    console.log(
      `Real local SRVPro WSS integration passed (TCP ${tcpPort}, WSS ${wssPort})`,
    );
  }
} catch (error) {
  console.error(error);
  console.error(
    "Local SRVPro output (last entries):",
    notes.slice(-30).join(""),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (previewServer)
    await new Promise((resolveClose) =>
      previewServer.httpServer.close(resolveClose),
    );
  await stopChild(publicTunnel?.child);
  await stopChild(nginxProcess);
  if (serverProcess && serverProcess.exitCode == null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/T", "/F", "/PID", String(serverProcess.pid)], {
        windowsHide: true,
      });
    else serverProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => serverProcess.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
    ]);
  }
  const safe =
    runtime.startsWith(auditRoot + sep) &&
    basename(runtime).startsWith("local-wss-");
  if (!safe) throw new Error(`Unsafe local test cleanup path: ${runtime}`);
  rmSync(runtime, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 500,
  });
  const localCertDir = resolve(auditRoot, "local-cert");
  if (dirname(localCertDir) !== auditRoot)
    throw new Error(`Unsafe certificate cleanup path: ${localCertDir}`);
  rmSync(localCertDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 200,
  });
}
