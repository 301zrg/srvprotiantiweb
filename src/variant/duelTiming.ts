import { fetchStrings, Region } from "@/api/strings";

import { formatDuelHint } from "./duelHintText";
import type { Language } from "./languageLink";

export type BattleTiming = number | "attack";
export interface DuelTiming {
  event?: { originMsg: string | number; cardID?: number };
  battle?: BattleTiming;
}

const battleHints = new Set([24, 25, 28, 29, 40, 41, 42, 43, 44]);
export const isBattleHint = (id: number) => battleHints.has(id);
export const corePhaseHint = (phase: number) =>
  (
    ({
      1: 20,
      2: 21,
      4: 22,
      8: 28,
      16: 24,
      32: 40,
      64: 42,
      128: 25,
      256: 22,
      512: 26,
    }) as Record<number, number>
  )[phase];
export const onlinePhaseHint = (phase: number) =>
  corePhaseHint([0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512][phase]);

const attackText: Record<string, string> = {
  cn: "攻击宣言时",
  en: "Attack declaration",
  ja: "攻撃宣言時",
  ko: "공격 선언 시",
};
export function battleTimingLabel(
  timing: BattleTiming | undefined,
  language: string,
) {
  return timing === "attack"
    ? attackText[language] ?? attackText.en
    : timing === undefined
    ? undefined
    : fetchStrings(Region.System, timing);
}

// These are the locked Core's hint_timing masks, not protobuf phase ordinals.
const timingHints: [number, BattleTiming][] = [
  [0x1, 20],
  [0x2, 21],
  [0x4, 23],
  [0x8, 28],
  [0x10, 25],
  [0x20, 26],
  [0x40, 1604],
  [0x80, 1606],
  [0x100, 1608],
  [0x1000, "attack"],
  [0x2000, 40],
  [0x4000, 42],
  [0x1000000, 24],
  [0x4000000, 29],
];
export function formatChainContext(
  source: DuelTiming["event"],
  hint0: number,
  hint1: number,
  language: string,
) {
  const event = source ? formatDuelHint(source, language as Language) : "";
  const hasEvent = event && event !== "?" && event !== "[?]";
  if (
    hasEvent &&
    source &&
    (typeof source.originMsg === "string" ||
      source.originMsg >= 1600 ||
      (source.originMsg >= 40 && source.originMsg <= 44))
  )
    return event;
  const mask = hint0 | hint1;
  const active = timingHints.filter(([bit]) => mask & bit);
  const labels = active.map(([, id]) => battleTimingLabel(id, language)!);
  const genericPhase =
    typeof source?.originMsg === "number" &&
    source.originMsg >= 20 &&
    source.originMsg <= 29;
  const preciseMask = active.some(
    ([, id]) => typeof id === "string" || id >= 40,
  );
  return [
    ...new Set(
      [...(!genericPhase || !preciseMask ? [event] : []), ...labels].filter(
        (s) => s && s !== "?" && s !== "[?]",
      ),
    ),
  ].join(" · ");
}

/** Presentation only. It never generates a Core response or changes rules. */
export function advanceCoreTiming(
  previous: DuelTiming,
  events: number[][],
  cardAt: (
    player: number,
    location: number,
    sequence: number,
  ) => number | undefined,
): DuelTiming {
  let next = { ...previous };
  const value = (e: number[], offset: number) =>
    new DataView(new Uint8Array(e).buffer).getUint32(offset, true);
  for (const e of events) {
    if (e[0] === 41) {
      const id = corePhaseHint(e[1] | (e[2] << 8));
      next = {
        event: id ? { originMsg: id } : undefined,
        battle: id && isBattleHint(id) ? id : undefined,
      };
    } else if (e[0] === 2 && e[1] === 1) {
      const id = value(e, 3);
      next.event = { originMsg: id };
      if (isBattleHint(id)) next.battle = id;
    } else if ([60, 62, 64].includes(e[0])) {
      next.event = {
        originMsg:
          e[0] === 60
            ? "「[?]」通常召唤宣言时"
            : e[0] === 62
            ? "「[?]」特殊召唤宣言时"
            : "「[?]」反转召唤宣言时",
        cardID: value(e, 1),
      };
    } else if ([61, 63, 65].includes(e[0])) {
      next.event = {
        originMsg: e[0] === 61 ? 1604 : e[0] === 63 ? 1606 : 1608,
      };
    } else if (e[0] === 70) {
      next.event = { originMsg: 1609, cardID: value(e, 1) };
    } else if (e[0] === 110) {
      next.battle = "attack";
      next.event = {
        originMsg: "「[?]」攻击时",
        cardID: cardAt(e[1], e[2], e[3]),
      };
    } else if (e[0] === 113) {
      next.battle = 40;
      next.event = { originMsg: 40 };
    } else if (e[0] === 10 || e[0] === 114) {
      next.battle = 24;
      next.event = { originMsg: 24 };
    } else if (e[0] === 11) {
      next.event = { originMsg: 22 };
    }
  }
  return next;
}
