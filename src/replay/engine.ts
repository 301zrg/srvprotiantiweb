import { Gunzip } from "fflate";

import { inspectReplay, parseReplayBody, type ReplayBody } from "./format";
import { sha256 } from "./hash";
import { parseQuery, type ReplayCard, splitCoreMessages } from "./messages";

export interface ReplayFrame {
  names: string[];
  lp: number[];
  turn: number;
  phase: number;
  turnPlayer: number;
  cards: ReplayCard[];
  events: number[][];
  step: number;
  consumed: number;
  total: number;
  end?: "complete" | "partial";
}
interface Module {
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
  [key: string]: any;
}
interface Profile {
  revision: string;
  unpackedScriptBytes: number;
  cardCount: number;
  files: Record<string, { bytes: number; sha256: string }>;
}
// Locked native ReplayMode::ReplayAnalyze reads a replay response only for
// selection/declaration messages. PROCESSOR_WAITING is also emitted for
// reveal/confirmation displays (PROCESSOR_WAIT), which consume no response.
const responseMessages = new Set([
  10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 22, 23, 24, 25, 26, 132, 140, 141,
  142, 143,
]);
export function unpackScripts(bytes: Uint8Array, expected: number): Uint8Array {
  if (expected > 64 * 1024 * 1024) throw new Error("脚本包预算异常");
  const parts: Uint8Array[] = [];
  let total = 0;
  const gzip = new Gunzip((part) => {
    total += part.length;
    if (total > expected) throw new Error("脚本解压超限");
    parts.push(part);
  });
  for (let p = 0; p < bytes.length; p += 16384)
    gzip.push(bytes.subarray(p, p + 16384), p + 16384 >= bytes.length);
  if (total !== expected) throw new Error("脚本包长度不匹配");
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

export class ReplayEngine {
  private handle = 0;
  private body!: ReplayBody;
  private response = 0;
  private waiting = false;
  private step = 0;
  private processes = 0;
  private elapsed = 0;
  private ended: ReplayFrame["end"];
  private hints = new Map<string, number>();
  constructor(private core: Module) {}
  private alloc(bytes: Uint8Array) {
    const p = this.core._malloc(bytes.length || 1);
    if (!p) throw new Error("录像内存不足");
    this.core.HEAPU8.set(bytes, p);
    return p;
  }
  private error() {
    const error = this.core.UTF8ToString(this.core._replay_error());
    if (error) throw new Error(error);
  }
  install(cards: Uint8Array, scripts: Uint8Array) {
    if (cards.length % 80) throw new Error("卡数据长度异常");
    const cp = this.alloc(cards);
    this.core._replay_add_cards(cp, cards.length / 80);
    this.core._free(cp);
    const length = new DataView(scripts.buffer, scripts.byteOffset).getUint32(
      0,
      true,
    );
    if (length > 4 * 1024 * 1024 || length + 4 > scripts.length)
      throw new Error("脚本索引长度异常");
    const index = JSON.parse(
      new TextDecoder().decode(scripts.subarray(4, 4 + length)),
    );
    if (!Array.isArray(index) || index.length > 20000)
      throw new Error("脚本索引异常");
    let end = 0;
    const seen = new Set<string>();
    for (const item of index) {
      if (
        typeof item.name !== "string" ||
        !/^[\w./-]+\.lua$/.test(item.name) ||
        item.name.includes("..") ||
        item.name.startsWith("/") ||
        seen.has(item.name) ||
        item.offset !== end ||
        !Number.isSafeInteger(item.bytes) ||
        item.bytes < 0 ||
        item.bytes > 1024 * 1024 ||
        4 + length + end + item.bytes > scripts.length
      )
        throw new Error("脚本索引路径或范围异常");
      seen.add(item.name);
      end += item.bytes;
    }
    if (4 + length + end !== scripts.length)
      throw new Error("脚本包剩余数据异常");
    for (const item of index) {
      const name = this.alloc(new TextEncoder().encode(item.name + "\0"));
      const ptr = this.alloc(
        scripts.subarray(
          4 + length + item.offset,
          4 + length + item.offset + item.bytes,
        ),
      );
      this.core._replay_add_script(name, ptr, item.bytes);
      this.core._free(name);
      this.core._free(ptr);
    }
    this.error();
  }
  open(bytes: Uint8Array) {
    this.close();
    const header = inspectReplay(bytes);
    if (!header.playable) throw new Error(header.reason);
    let unpacked: Uint8Array;
    if (header.flags & 1) {
      const source = this.alloc(bytes.subarray(header.headerSize)),
        props = this.alloc(bytes.subarray(24, 29)),
        out = this.core._malloc(header.bodySize);
      if (!out) throw new Error("录像内存不足");
      try {
        if (
          !this.core._replay_decode_lzma(
            source,
            bytes.length - header.headerSize,
            props,
            out,
            header.bodySize,
          )
        )
          throw new Error("录像 LZMA 正文损坏");
        unpacked = this.core.HEAPU8.slice(out, out + header.bodySize);
      } finally {
        this.core._free(source);
        this.core._free(props);
        this.core._free(out);
      }
    } else unpacked = bytes.subarray(header.headerSize);
    this.body = parseReplayBody(unpacked);
    this.response = 0;
    this.step = 0;
    this.waiting = false;
    this.ended = undefined;
    this.hints.clear();
    this.processes = 0;
    this.elapsed = 0;
    const seed = this.alloc(
      new Uint8Array(new Uint32Array(header.seeds).buffer),
    );
    this.handle = this.core._replay_create(seed, header.seed, 0);
    this.core._free(seed);
    this.error();
    if (!this.handle || !this.core._replay_has_special(this.handle))
      throw new Error("706 旧裁定补丁初始化失败");
    for (let player = 0; player < 2; player++) {
      this.core._set_player_info(
        this.handle,
        player,
        this.body.lp,
        this.body.hand,
        this.body.draw,
      );
      for (const code of this.body.decks[player].main)
        this.core._new_card(this.handle, code, player, player, 1, 0, 8);
      for (const code of this.body.decks[player].extra)
        this.core._new_card(this.handle, code, player, player, 64, 0, 8);
    }
    this.error();
    this.core._start_duel(this.handle, this.body.rules);
    this.error();
    return this.frame([]);
  }
  next(): ReplayFrame {
    if (!this.handle) throw new Error("录像尚未打开");
    if (this.ended) return this.frame([]);
    if (this.waiting) {
      if (this.response === this.body.responses.length) {
        this.ended = "partial";
        return this.frame([]);
      }
      const buffer = new Uint8Array(256);
      buffer.set(this.body.responses[this.response++]);
      const p = this.alloc(buffer);
      this.core._set_responseb(this.handle, p);
      this.core._free(p);
      this.waiting = false;
    }
    const started = performance.now();
    try {
      for (;;) {
        if (
          ++this.processes > 1000000 ||
          this.elapsed + performance.now() - started > 120000 ||
          performance.now() - started > 9000
        )
          throw new Error("录像计算超时，已停止播放");
        const result = this.core._process(this.handle) >>> 0;
        this.error();
        const size = result & 0xfffffff;
        if (size > 256 * 1024) throw new Error("Core 消息超过批次限制");
        this.waiting = false;
        let events: number[][] = [];
        if (size) {
          const p = this.core._malloc(size);
          if (!p) throw new Error("录像内存不足");
          try {
            this.core._get_message(this.handle, p);
            events = splitCoreMessages(this.core.HEAPU8.slice(p, p + size)).map(
              (b) => Array.from(b),
            );
          } finally {
            this.core._free(p);
          }
          if (events.some((e) => e[0] === 1))
            throw new Error("录像响应与当前旧裁定环境不一致（MSG_RETRY）");
          this.waiting = events.some((e) => responseMessages.has(e[0]));
          for (const e of events) {
            if (e[0] === 160 && e[5] === 2)
              this.hints.set(
                `${e[1]}:${e[2]}:${e[3]}`,
                new DataView(new Uint8Array(e).buffer).getUint32(6, true),
              );
            if (e[0] === 50) {
              const from = `${e[5]}:${e[6]}:${e[7]}`,
                value = this.hints.get(from);
              this.hints.delete(from);
              if (value && (e[10] === 4 || e[10] === 8))
                this.hints.set(`${e[9]}:${e[10]}:${e[11]}`, value);
            }
          }
          if (events.some((e) => e[0] === 5) || result & 0x20000000) {
            if (this.response !== this.body.responses.length)
              throw new Error("录像终局仍有未消费响应，环境不匹配");
            this.ended = "complete";
          }
          this.step++;
          return this.frame(events);
        }
        if (result & 0x20000000) {
          this.ended =
            this.response === this.body.responses.length
              ? "complete"
              : "partial";
          return this.frame([]);
        }
      }
    } finally {
      this.elapsed += performance.now() - started;
    }
  }
  private frame(events: number[][]): ReplayFrame {
    const cards: ReplayCard[] = [];
    const buffer = this.core._malloc(256 * 1024);
    if (!buffer) throw new Error("查询内存不足");
    try {
      for (let player = 0; player < 2; player++)
        for (const location of [1, 2, 4, 8, 16, 32, 64]) {
          // Uncached complete query, including actual ATK/DEF, materials and counters.
          const size = this.core._query_field_card(
            this.handle,
            player,
            location,
            0xf03ff,
            buffer,
            0,
          );
          if (size < 0 || size > 256 * 1024) throw new Error("查询消息超限");
          cards.push(
            ...parseQuery(
              this.core.HEAPU8.slice(buffer, buffer + size),
              player,
              location,
            ),
          );
        }
    } finally {
      this.core._free(buffer);
    }
    this.error();
    for (const card of cards)
      card.declared = this.hints.get(
        `${card.player}:${card.location}:${card.sequence}`,
      );
    return {
      names: this.body.names,
      lp: [0, 1].map((i) => this.core._replay_state(this.handle, i)),
      turn: this.core._replay_state(this.handle, 2),
      phase: this.core._replay_state(this.handle, 3),
      turnPlayer: this.core._replay_state(this.handle, 4),
      cards,
      events,
      step: this.step,
      consumed: this.response,
      total: this.body.responses.length,
      end: this.ended,
    };
  }
  close() {
    if (this.handle) this.core._end_duel(this.handle);
    this.handle = 0;
  }
}

export async function loadReplayEngine(
  base: string,
  profile: Profile,
  status: (text: string) => void,
): Promise<ReplayEngine> {
  const file = async (name: string) => {
    const record = profile.files[name];
    if (!record || record.bytes > 16 * 1024 * 1024)
      throw new Error("播放资源清单异常");
    const url = new URL(name, base).href;
    status(`正在加载 ${name}`);
    let cache: Cache | undefined;
    try {
      cache = await caches.open("srvpro-replay-706-v1");
    } catch {
      /* Storage may be disabled. */
    }
    let response = await cache?.match(url);
    const read = async (r: Response) => {
      if (!r.ok) throw new Error(`播放资源请求失败：${r.status}`);
      const reader = r.body?.getReader();
      if (!reader) throw new Error("资源流不可用");
      const parts = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > record.bytes) {
          await reader.cancel();
          throw new Error("播放资源超限");
        }
        parts.push(value);
      }
      const bytes = new Uint8Array(size);
      let p = 0;
      for (const part of parts) {
        bytes.set(part, p);
        p += part.length;
      }
      if (size !== record.bytes || (await sha256(bytes)) !== record.sha256)
        throw new Error("播放资源校验失败");
      return bytes;
    };
    if (response) {
      try {
        return await read(response);
      } catch {
        await cache?.delete(url);
      }
    }
    response = await fetch(url, { cache: "no-store" });
    const bytes = await read(response);
    try {
      await cache?.put(url, new Response(bytes));
    } catch {
      /* Playback does not require caching. */
    }
    return bytes;
  };
  const [js, wasm, cards, compressed] = await Promise.all([
    file("ocgcore.js"),
    file("ocgcore.wasm"),
    file("cards.data"),
    file("scripts.data"),
  ]);
  const moduleUrl = URL.createObjectURL(
    new Blob([js], { type: "text/javascript" }),
  );
  try {
    const factory = (await import(/* @vite-ignore */ moduleUrl)).default;
    const core = await factory({
      wasmBinary: wasm,
      locateFile: (name: string) => new URL(name, base).href,
      printErr: () => {},
    });
    status("正在初始化旧裁定脚本");
    const engine = new ReplayEngine(core);
    engine.install(
      cards,
      unpackScripts(compressed, profile.unpackedScriptBytes),
    );
    return engine;
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}
