// An owned, deterministic match in a new isolated directory. Never reads a
// private config, account database, production replay, or running server port.
import { spawn } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
const root = resolve("."),
  server = resolve(process.argv[2] || "../../../srvprotianti");
const monk = process.argv.includes("--monk"),
  confirm = process.argv.includes("--confirm"),
  battle = monk || confirm || process.argv.includes("--battle");
const table = readFileSync("public/replay/706-v1/cards.data"),
  validCodes = new Set();
for (let p = 0; p < table.length; p += 80)
  validCodes.add(table.readUInt32LE(p));
for (const code of [
  44178886, 21502796, 69247929, 69140098, 40619825, 89631139, 46986414,
  91188343, 64734921,
])
  if (!validCodes.has(code))
    throw new Error(`Synthetic input card is missing: ${code}`);
mkdirSync(join(root, ".audit-tmp"), { recursive: true });
const runtime = mkdtempSync(join(root, ".audit-tmp", "replay-native-"));
const game = join(runtime, "game");
mkdirSync(game);
const copy = (source, target) => {
  mkdirSync(resolve(target, ".."), { recursive: true });
  cpSync(source, target, { recursive: true });
};
for (const name of ["ygopro.exe", "cards.cdb", "strings.conf", "lflist.conf"]) {
  const source =
    name === "ygopro.exe"
      ? join(server, "ygopro", name)
      : name === "lflist.conf"
      ? join(root, "public/environment/1103-201103-v1", name)
      : join(root, "public/environment/1103-201103-v1/zh-CN", name);
  copy(source, join(game, name));
}
symlinkSync(join(server, "ygopro/script"), join(game, "script"), "junction");
copy(join(server, "ygopro/expansions/script"), join(game, "expansions/script"));
const probe = net.createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));
const seeds = Buffer.alloc(32);
[11, 22, 33, 44, 55, 66, 77, 88].forEach((n, i) =>
  seeds.writeUInt32LE(n, i * 4),
);
const child = spawn(
  join(game, "ygopro.exe"),
  [
    String(port),
    "0",
    "0",
    "0",
    "2",
    "T",
    "F",
    "8000",
    "5",
    "1",
    "0",
    "1",
    seeds.toString("base64"),
  ],
  { cwd: game, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
const sockets = [],
  trace = [],
  seen = new Set();
let joined = 0,
  replay;
const packet = (proto, body = Buffer.alloc(0)) => {
  const bytes = Buffer.alloc(body.length + 3);
  bytes.writeUInt16LE(body.length + 1, 0);
  bytes[2] = proto;
  body.copy(bytes, 3);
  return bytes;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
try {
  const deadline = Date.now() + 60000;
  for (;;) {
    try {
      const test = await new Promise((r, j) => {
        const s = net.connect(port, "127.0.0.1");
        s.once("connect", () => r(s));
        s.once("error", j);
      });
      test.destroy();
      break;
    } catch {
      if (child.exitCode != null || Date.now() > deadline)
        throw new Error("Native server failed: " + logs);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  for (let player = 0; player < 2; player++) {
    const socket = net.connect(port, "127.0.0.1");
    sockets.push(socket);
    let pending = Buffer.alloc(0);
    socket.on("connect", () => {
      const name = Buffer.alloc(40);
      name.write(`ReplayFixture${player === 0 ? "A" : "B"}`, "utf16le");
      socket.write(packet(0x10, name));
      const joinGame = Buffer.alloc(48);
      joinGame.writeUInt16LE(0x1362);
      socket.write(packet(0x12, joinGame));
    });
    socket.on("error", (e) => {
      logs += e.message;
    });
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 3) {
        const size = pending.readUInt16LE(0);
        if (pending.length < size + 2) break;
        const proto = pending[2],
          body = pending.subarray(3, size + 2);
        pending = pending.subarray(size + 2);
        if (proto === 0x12) {
          const deck = Buffer.alloc(8 + 40 * 4);
          deck.writeUInt32LE(40);
          for (let i = 0; i < 40; i++)
            deck.writeUInt32LE(
              confirm
                ? player === 0
                  ? i % 2
                    ? 64734921
                    : 91188343
                  : 46986414
                : monk
                ? player === 0
                  ? 44178886
                  : 21502796
                : battle
                ? [69247929, 69140098, 40619825][i % 3]
                : i % 2
                ? 89631139
                : 46986414,
              8 + i * 4,
            );
          socket.write(packet(2, deck));
          socket.write(packet(0x22));
          if (++joined === 2)
            setTimeout(() => sockets[0].write(packet(0x25)), 150);
        }
        if (proto === 3) socket.write(packet(3, Buffer.from([player + 1])));
        if (proto === 4) socket.write(packet(4, Buffer.from([1])));
        if (proto === 0x17) replay = Buffer.from(body);
        if (proto === 2) logs += ` Error packet ${body.toString("hex")}`;
        if (proto !== 1 || !body.length) continue;
        const code = body[0];
        if (code === 11) {
          let response = 7;
          if (battle) {
            let p = 2;
            const counts = [];
            for (let i = 0; i < 5; i++) {
              const n = body[p++];
              counts.push(n);
              p += n * 7;
            }
            const activations = body[p++];
            p += activations * 11;
            if (monk && player === 1) {
              if (counts[3]) response = 3;
              else if (body[p]) response = 6;
            } else if (counts[0]) response = 0;
            else if (activations) response = 5;
            else if (body[p]) response = 6;
          }
          socket.write(packet(1, u32(response)));
        }
        if (code === 10) {
          const attackOffset = 3 + body[2] * 11;
          socket.write(packet(1, u32(battle && body[attackOffset] ? 1 : 3)));
        }
        if (code === 16)
          socket.write(packet(1, u32(monk && body[4] && body[2] ? 0 : -1)));
        if (code === 12 || code === 13)
          socket.write(packet(1, u32(confirm && player === 0 ? 1 : 0)));
        if (code === 14) socket.write(packet(1, u32(0)));
        if (code === 15) {
          const n = body[3];
          socket.write(
            packet(
              1,
              Buffer.from([n, ...Array.from({ length: n }, (_, i) => i)]),
            ),
          );
        }
        if (code === 18) {
          const mask = body.readUInt32LE(3);
          let chosen = -1;
          for (let bit = 0; bit < 32; bit++) {
            if (!(mask & (1 << bit))) {
              chosen = bit;
              break;
            }
          }
          if (chosen < 0) throw new Error("No valid synthetic place");
          socket.write(
            packet(
              1,
              Buffer.from([
                chosen >= 16 ? 1 - body[1] : body[1],
                chosen % 16 >= 8 ? 8 : 4,
                chosen % 8,
              ]),
            ),
          );
        }
        if (code === 19) {
          const mask = body[6];
          socket.write(packet(1, u32([1, 4, 8, 2].find((n) => mask & n) || 1)));
        }
        if (code === 1) logs += " Core rejected synthetic response";
        if (code === 90) {
          const ids = Array.from(
            { length: body[2] },
            (_, i) => body.readUInt32LE(3 + i * 4) & 0x7fffffff,
          );
          if (ids.every(Boolean)) {
            const key = body.toString("hex");
            if (!seen.has(key)) {
              trace.push({ code, player: body[1], cards: ids });
              seen.add(key);
            }
          }
        }
        if (
          player === 0 &&
          ([40, 41, 5, 91, 92, 100, 60, 70].includes(code) ||
            (confirm && code === 31))
        )
          trace.push({ code, data: Array.from(body.subarray(1)) });
      }
    });
    await new Promise((r) => socket.once("connect", r));
  }
  while (!replay) {
    if (Date.now() > deadline) throw new Error("No native replay: " + logs);
    await new Promise((r) => setTimeout(r, 100));
  }
  const target = join(root, "tests/fixtures/replay");
  mkdirSync(target, { recursive: true });
  const name = confirm
    ? "native-confirm-search"
    : monk
    ? "native-monk-flip"
    : battle
    ? "native-battle-equip"
    : "native-deckout";
  writeFileSync(join(target, name + ".yrp"), replay);
  writeFileSync(
    join(target, name + ".json"),
    JSON.stringify(
      {
        provenance:
          "Generated locally with two owned synthetic players; no private player data",
        coreCandidate: "e04144d62499c17d0cfa8313f9742434ef99c3a7",
        seeds: Array.from({ length: 8 }, (_, i) => seeds.readUInt32LE(i * 4)),
        sha256: createHash("sha256").update(replay).digest("hex"),
        trace,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Native fixture ${replay.length} bytes, ${trace.length} trace checkpoints. Runtime: ${runtime}`,
  );
} finally {
  for (const socket of sockets) socket.destroy();
  if (child.exitCode == null) child.kill();
}
