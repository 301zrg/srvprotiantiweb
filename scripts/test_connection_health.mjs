// Exercise the actual transport while its presentation consumer is blocked.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const folder = resolve(".audit-tmp/connection-health-tests");
mkdirSync(folder, { recursive: true });
const compiled = await build({
  stdin: {
    contents:
      'export { WebSocketStream } from "./src/infra/stream.ts"; export { default as handleTimeLimit } from "./src/service/duel/timeLimit.ts"; export { quickCommandStore, sendQuickCommand, resetQuickCommands } from "./src/variant/quickCommands.ts";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  tsconfig: "tsconfig.json",
  plugins: [
    {
      name: "isolated-browser-services",
      setup(builder) {
        const stubs = {
          "@/replay/capture":
            "export class ReplayCapture { receive() {} stop() {} }",
          "@/variant": 'export const getLanguage = () => "ja";',
          "@/variant/connection": "export const connectionStore = {};",
          "@/variant/duelDiagnostics":
            "export const markMessageArrival = () => {};",
          "@/variant/messages":
            'export const siteMessages = () => ({ connectionClosed: "closed", connectionFailed: "failed", packetFailed: "packet" });',
          "@/api":
            "export const sendTimeConfirm = conn => conn.ws.send(Uint8Array.of(1, 0, 21)); export const sendChat = conn => conn.ws.send(Uint8Array.of(1, 0, 22));",
        };
        builder.onResolve({ filter: /^@\// }, (args) =>
          args.path in stubs
            ? { path: args.path, namespace: "browser-stub" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "browser-stub" }, (args) => ({
          contents: stubs[args.path],
          loader: "js",
        }));
      },
    },
  ],
});
const output = resolve(folder, "transport.mjs");
writeFileSync(output, compiled.outputFiles[0].text);
globalThis.window = { setTimeout, clearTimeout };
globalThis.document = { hidden: false };
class Socket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = Socket.CONNECTING;
  sent = [];
  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.({});
  }
  send(bytes) {
    assert.equal(this.readyState, Socket.OPEN);
    this.sent.push([...bytes]);
  }
  receive(bytes) {
    this.onmessage?.({ data: Uint8Array.from(bytes).buffer });
  }
  close() {
    this.readyState = Socket.CLOSED;
    this.onclose?.({ code: 1000 });
  }
}
globalThis.WebSocket = Socket;
const {
  WebSocketStream,
  handleTimeLimit,
  quickCommandStore,
  sendQuickCommand,
  resetQuickCommands,
} = await import(pathToFileURL(output));
const frame = (proto, payload = []) => [
  payload.length + 1,
  0,
  proto,
  ...payload,
];
const start = (controller) => frame(1, [4, controller, ...Array(16).fill(0)]);
const timer = (player, seconds = 180) =>
  frame(24, [player, 0, seconds & 255, seconds >> 8]);
const ack = [1, 0, 21];
const fixture = () => {
  const conn = new WebSocketStream("wss://local.invalid/neos", () => {});
  conn.ws.open();
  return conn;
};

const conn = fixture();
let release;
let consumed = 0;
const gate = new Promise((resolveGate) => {
  release = resolveGate;
});
const execution = conn.execute(async () => {
  consumed++;
  await gate;
});
conn.ws.receive(frame(19, [0x10]));
await Promise.resolve();
assert.equal(consumed, 1);
conn.ws.receive(start(0));
conn.ws.receive(timer(1));
assert.deepEqual(
  conn.ws.sent,
  [],
  "Do not acknowledge the other player's timer",
);
const split = timer(0);
conn.ws.receive(split.slice(0, 5));
assert.deepEqual(
  conn.ws.sent,
  [],
  "A partial timer is not an acknowledgement request",
);
conn.ws.receive(split.slice(5));
assert.deepEqual(
  conn.ws.sent,
  [ack],
  "Confirm before an animation/dialog releases the UI queue",
);
assert.equal(consumed, 1, "The presentation consumer is still blocked");
conn.ws.receive([...start(1), ...timer(0), ...timer(1)]);
assert.deepEqual(
  conn.ws.sent,
  [ack, ack],
  "A new game's actual controller overrides old UI state",
);
let displayed;
handleTimeLimit(
  {
    conn,
    context: {
      matStore: {
        isMe: () => true,
        timeLimits: {
          set: (...args) => {
            displayed = args;
          },
        },
      },
    },
  },
  { player: 1, left_time: 180 },
);
assert.deepEqual(displayed, [1, 180]);
assert.deepEqual(
  conn.ws.sent,
  [ack, ack],
  "UI consumption never confirms the same timer twice",
);
release();
conn.close();
await execution;
conn.ws.receive(timer(1));
assert.deepEqual(
  conn.ws.sent,
  [ack, ack],
  "A cancelled connection cannot send acknowledgements",
);

const spectator = fixture();
spectator.ws.receive([
  ...frame(19, [7]),
  ...start(0x10),
  ...timer(0),
  ...timer(1),
]);
assert.deepEqual(
  spectator.ws.sent,
  [],
  "Spectators never answer player heartbeats",
);
spectator.close();

const siding = fixture();
siding.ws.receive([...frame(19, [1]), ...timer(0, 0), ...timer(1, 0)]);
assert.deepEqual(
  siding.ws.sent,
  [ack],
  "Pre-duel/Side heartbeats work before MSG_START",
);
siding.ws.receive(frame(24, [0]));
assert.deepEqual(
  siding.ws.sent,
  [ack],
  "Malformed timers are not acknowledged",
);
siding.close();

const unknown = fixture();
unknown.ws.receive(timer(0));
assert.deepEqual(
  unknown.ws.sent,
  [],
  "Do not invent a player identity before TYPE_CHANGE/MSG_START",
);
unknown.close();

const tag = fixture();
const host = Array(20).fill(0);
host[5] = 2;
tag.ws.receive([
  ...frame(18, host),
  ...frame(19, [0]),
  ...start(0),
  ...timer(0),
]);
assert.deepEqual(
  tag.ws.sent,
  [],
  "Tag retains its existing turn-specific confirmation path",
);
assert.equal(tag.confirmsTimeLimitsOnArrival, false);
tag.close();
// An open prompt holds the chat line in the queue; the lock follows the network.
const commandConn = fixture();
let releaseCommands;
const commandGate = new Promise((resolveGate) => {
  releaseCommands = resolveGate;
});
const commandExecution = commandConn.execute(() => commandGate);
commandConn.ws.receive(frame(19, [0x10]));
const chat = (player) => frame(25, [player, 0, 65, 0, 0, 0]);
sendQuickCommand(commandConn, "tip");
sendQuickCommand(commandConn, "tip");
sendQuickCommand(commandConn, "roomname");
assert.equal(commandConn.ws.sent.length, 2, "A locked command sends once");
assert.deepEqual({ ...quickCommandStore }, { tip: true, roomname: true });
commandConn.ws.receive(chat(0));
assert.deepEqual(
  { ...quickCommandStore },
  { tip: true, roomname: true },
  "Another player's chat is not a reply",
);
const earlier = fixture();
earlier.ws.receive(chat(8));
assert.equal(quickCommandStore.tip, true, "Only the current connection answers");
earlier.close();
const reply = chat(8);
commandConn.ws.receive(reply.slice(0, 3));
assert.equal(quickCommandStore.tip, true, "A partial reply does not unlock");
commandConn.ws.receive(reply.slice(3));
assert.deepEqual(
  { ...quickCommandStore },
  { tip: false, roomname: true },
  "The reply unlocks at arrival even though the UI queue is blocked",
);
const replacement = fixture();
resetQuickCommands(replacement);
assert.equal(quickCommandStore.roomname, false, "A new connection clears the lock");
replacement.close();
releaseCommands();
commandConn.close();
await commandExecution;

const closedConn = fixture();
closedConn.close();
sendQuickCommand(closedConn, "tip");
assert.deepEqual(closedConn.ws.sent, [], "A closed socket is not written to");
assert.equal(quickCommandStore.tip, true, "No reply can come: it stays locked");
resetQuickCommands(fixture());

console.log(
  "PASS immediate TIME_CONFIRM: blocked UI, split/merged packets, G2 controller, Side, observer, cancellation and Tag fallback",
);
