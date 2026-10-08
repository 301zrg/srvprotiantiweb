/** Exact lengths from the locked native ReplayAnalyze; never guess a boundary. */
export function splitCoreMessages(bytes: Uint8Array): Uint8Array[] {
  const result: Uint8Array[] = [];
  let p = 0;
  const take = (n: number) => {
    if (n < 0 || p + n > bytes.length) throw new Error("Core 消息截断");
    const start = p;
    p += n;
    return start;
  };
  const u8 = () => bytes[take(1)];
  const counted = (stride: number) => take(u8() * stride);
  const fixed: Record<number, number> = {
    1: 0,
    2: 6,
    5: 2,
    12: 13,
    13: 5,
    18: 6,
    19: 6,
    24: 6,
    32: 1,
    34: 1,
    35: 1,
    37: 0,
    38: 6,
    40: 1,
    41: 2,
    50: 16,
    53: 9,
    54: 8,
    55: 16,
    56: 4,
    60: 8,
    61: 0,
    62: 8,
    63: 0,
    64: 8,
    65: 0,
    70: 16,
    71: 1,
    72: 1,
    73: 1,
    74: 0,
    75: 1,
    76: 1,
    91: 5,
    92: 5,
    93: 8,
    94: 5,
    95: 4,
    96: 8,
    97: 8,
    100: 5,
    101: 7,
    102: 7,
    110: 8,
    111: 26,
    112: 0,
    113: 0,
    114: 0,
    120: 8,
    132: 1,
    133: 1,
    140: 6,
    141: 6,
    160: 9,
    165: 6,
    170: 4,
  };
  while (p < bytes.length) {
    if (result.length >= 128) throw new Error("Core 消息批次超出限制");
    const start = p,
      code = u8();
    if (code in fixed) take(fixed[code]);
    else
      switch (code) {
        case 10:
          take(1);
          counted(11);
          counted(8);
          take(2);
          break;
        case 11:
          take(1);
          for (let i = 0; i < 5; i++) counted(7);
          counted(11);
          take(3);
          break;
        case 14:
        case 142:
        case 143:
          take(1);
          counted(4);
          break;
        case 15:
        case 20:
          take(4);
          counted(8);
          break;
        case 16: {
          take(1);
          const n = u8();
          take(9 + n * 14);
          break;
        }
        case 22:
          take(5);
          counted(9);
          break;
        case 23:
          take(8);
          counted(11);
          counted(11);
          break;
        case 25:
          take(1);
          counted(7);
          break;
        case 26:
          take(5);
          counted(8);
          counted(8);
          break;
        case 30:
        case 42:
          take(1);
          counted(7);
          break;
        case 31:
          take(2);
          counted(7);
          break;
        case 33:
        case 39:
        case 90:
          take(1);
          counted(4);
          break;
        case 36:
          take(1);
          counted(8);
          break;
        case 81:
          take(1);
          counted(4);
          break;
        case 83:
          counted(4);
          break;
        case 130:
        case 131:
          take(1);
          counted(1);
          break;
        case 163:
        case 164: {
          const n = new DataView(
            bytes.buffer,
            bytes.byteOffset + take(2),
            2,
          ).getUint16(0, true);
          take(n + 1);
          break;
        }
        default:
          throw new Error(`不支持 Core 消息 ${code}`);
      }
    result.push(bytes.slice(start, p));
  }
  return result;
}

export interface ReplayCard {
  declared?: number;
  code: number;
  position: number;
  sequence: number;
  location: number;
  player: number;
  attack: number;
  defense: number;
  type: number;
  level: number;
  rank: number;
  overlay: number[];
  counters: number[];
  status?: number;
  owner?: number;
}
export function parseQuery(
  bytes: Uint8Array,
  player: number,
  location: number,
): ReplayCard[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0,
    sequence = 0;
  const cards: ReplayCard[] = [];
  while (p < bytes.length) {
    if (p + 4 > bytes.length) throw new Error("查询消息截断");
    const size = v.getUint32(p, true),
      end = p + size;
    if (size < 4 || end > bytes.length) throw new Error("查询长度异常");
    p += 4;
    if (size === 4) {
      sequence++;
      continue;
    }
    const flags = v.getUint32(p, true);
    p += 4;
    const u32 = () => {
      if (p + 4 > end) throw new Error("卡片查询截断");
      const n = v.getUint32(p, true);
      p += 4;
      return n;
    };
    const card: ReplayCard = {
      code: 0,
      position: 0,
      sequence: sequence++,
      location,
      player,
      attack: 0,
      defense: 0,
      type: 0,
      level: 0,
      rank: 0,
      overlay: [],
      counters: [],
    };
    for (let bit = 1; bit <= 0x800000; bit *= 2) {
      if (!(flags & bit)) continue;
      if ([0x8000, 0x10000, 0x20000].includes(bit)) {
        const n = u32();
        if (n > 256) throw new Error("查询数组超限");
        const list = Array.from({ length: n }, u32);
        if (bit === 0x10000) card.overlay = list;
        if (bit === 0x20000) card.counters = list;
      } else {
        const n = u32();
        if (bit === 1) card.code = n;
        if (bit === 2) {
          card.position = n >>> 24;
          card.sequence = (n >>> 16) & 255;
        }
        if (bit === 8) card.type = n;
        if (bit === 16) card.level = n;
        if (bit === 32) card.rank = n;
        if (bit === 256) card.attack = n | 0;
        if (bit === 512) card.defense = n | 0;
        if (bit === 0x40000) card.owner = n;
        if (bit === 0x80000) card.status = n;
        if (bit === 0x800000) u32();
      }
    }
    if (p !== end) throw new Error("查询格式不匹配");
    cards.push(card);
  }
  return cards;
}
