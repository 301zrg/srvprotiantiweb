export const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
export const MAX_BODY_BYTES = 512 * 1024;
export interface ReplayHeader {
  format: "YRP1" | "YRP2" | "YRP3D";
  version: number;
  flags: number;
  seed: number;
  seeds: number[];
  bodySize: number;
  headerSize: number;
  timestamp: number;
  playable: boolean;
  reason: string;
}

export function inspectReplay(bytes: Uint8Array, filename = ""): ReplayHeader {
  if (/\.yrp3d$/i.test(filename)) {
    if (!bytes.length || bytes.length > MAX_REPLAY_BYTES)
      throw new Error("录像文件大小无效（上限 8 MB）");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0,
      records = 0;
    while (offset < bytes.length) {
      if (offset + 5 > bytes.length) throw new Error("旧消息录像头已截断");
      const length = view.getUint32(offset + 1, true);
      if (
        length > 65535 ||
        offset + 5 + length > bytes.length ||
        ++records > 50000
      )
        throw new Error("旧消息录像长度超出限制或已截断");
      offset += 5 + length;
    }
    return {
      format: "YRP3D",
      version: 0,
      flags: 0,
      seed: 0,
      seeds: [],
      bodySize: bytes.length,
      headerSize: 0,
      timestamp: 0,
      playable: false,
      reason: "旧 Neos 消息录像暂仅保存与下载",
    };
  }
  if (bytes.length < 32 || bytes.length > MAX_REPLAY_BYTES)
    throw new Error("录像文件大小无效（上限 8 MB）");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = v.getUint32(0, true);
  if (magic !== 0x31707279 && magic !== 0x32707279)
    throw new Error("不是标准 YGOPro .yrp 录像");
  const format = magic === 0x32707279 ? "YRP2" : "YRP1";
  const flags = v.getUint32(8, true);
  const bodySize = v.getUint32(16, true);
  const headerSize = format === "YRP2" ? 80 : 32;
  if (
    bytes.length <= headerSize ||
    bodySize < 1 ||
    bodySize > MAX_BODY_BYTES ||
    flags & ~31
  )
    throw new Error("录像头、长度或标记无效");
  if (format === "YRP2" && v.getUint32(64, true) !== 1)
    throw new Error("不支持此录像头版本");
  if (flags & 1) {
    const prop = bytes[24],
      dict = v.getUint32(25, true);
    const lc = prop % 9,
      lp = Math.floor(prop / 9) % 5;
    if (prop >= 225 || lc + lp > 4 || dict > 32 * 1024 * 1024)
      throw new Error("录像压缩参数超出限制");
  } else if (bytes.length - headerSize !== bodySize)
    throw new Error("录像正文已截断或存在多余数据");
  const version = v.getUint32(4, true);
  const reason =
    format !== "YRP2"
      ? "旧版 YRP1 暂仅保存与下载"
      : flags & 2
      ? "双打录像暂仅保存与下载"
      : flags & 8
      ? "单人谜题录像暂仅保存与下载"
      : !(flags & 16)
      ? "非 UNIFORM 录像暂仅保存与下载"
      : version !== 0x1362
      ? `录像版本 0x${version.toString(16)} 尚未验证，暂仅保存与下载`
      : "";
  return {
    format,
    version,
    flags,
    seed: v.getUint32(12, true),
    seeds:
      format === "YRP2"
        ? Array.from({ length: 8 }, (_, i) => v.getUint32(32 + i * 4, true))
        : [],
    bodySize,
    headerSize,
    timestamp: v.getUint32(20, true),
    playable: !reason,
    reason,
  };
}

export interface ReplayBody {
  names: string[];
  lp: number;
  hand: number;
  draw: number;
  rules: number;
  decks: { main: number[]; extra: number[] }[];
  responses: Uint8Array[];
}
export function parseReplayBody(bytes: Uint8Array): ReplayBody {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const take = (n: number) => {
    if (n < 0 || pos + n > bytes.length) throw new Error("录像正文已截断");
    const start = pos;
    pos += n;
    return start;
  };
  const u32 = () => v.getUint32(take(4), true);
  const names = Array.from({ length: 2 }, () => {
    const text = new TextDecoder("utf-16le").decode(
      bytes.subarray(take(40), pos),
    );
    return text
      .split("\0")[0]
      .split("$")[0]
      .replace(/[\x00-\x1f]/g, "")
      .slice(0, 20);
  });
  const lp = u32(),
    hand = u32(),
    draw = u32(),
    rules = u32();
  if (!lp || lp > 100000000 || hand > 60 || draw > 60 || rules & 0x20)
    throw new Error("录像规则参数无效或为双打模式");
  const list = () => {
    const count = u32();
    if (count > 250) throw new Error("录像牌组长度异常");
    return Array.from({ length: count }, () => {
      const code = u32();
      if (!code) throw new Error("录像包含无效卡号");
      return code;
    });
  };
  const decks = Array.from({ length: 2 }, () => ({
    main: list(),
    extra: list(),
  }));
  const responses = [];
  while (pos < bytes.length) {
    const length = bytes[take(1)];
    if (!length) throw new Error("录像响应长度为零");
    responses.push(bytes.slice(take(length), pos));
  }
  return { names, lp, hand, draw, rules, decks, responses };
}

export function safeReplayName(name: string) {
  const extension = /\.yrp3d$/i.test(name) ? ".yrp3d" : ".yrp";
  return (
    (name.split(/[\\/]/).pop() || "replay.yrp")
      .replace(/[\x00-\x1f<>:"|?*]/g, "_")
      .slice(0, 120)
      .replace(/\.(yrp|yrp3d)$/i, "") + extension
  );
}
