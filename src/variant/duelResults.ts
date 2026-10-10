import { fetchCard, fetchStrings, getStrings, Region } from "@/api";

import type { Language } from "./languageLink";

export type DuelResult =
  | {
      kind:
        | "option"
        | "race"
        | "attribute"
        | "number"
        | "zone"
        | "card"
        | "effect"
        | "message"
        | "turn"
        | "cardDescriptionAdded"
        | "cardDescriptionRemoved"
        | "playerDescriptionAdded"
        | "playerDescriptionRemoved";
      value: number;
    }
  | { kind: "coin" | "dice"; values: number[] }
  | { kind: "yesNo" | "effectDecision"; value: number; accepted: boolean };

export type ValueResultKind = Exclude<
  DuelResult["kind"],
  "coin" | "dice" | "yesNo" | "effectDecision"
>;

const messages = {
  cn: {
    self: "我方",
    opponent: "对方",
    first: "先攻方",
    second: "后攻方",
    option: "选择结果",
    type: "宣言卡片类型",
    race: "宣言种族",
    attribute: "宣言属性",
    number: "宣言数字",
    zone: "选择区域",
    card: "宣言卡片",
    effect: "效果提示",
    message: "效果消息",
    turn: "回合计数",
    cardDescriptionAdded: "卡片提示生效",
    cardDescriptionRemoved: "卡片提示结束",
    playerDescriptionAdded: "玩家效果／限制生效",
    playerDescriptionRemoved: "玩家效果／限制结束",
    coin: "投掷硬币结果",
    dice: "投掷骰子结果",
    yesNo: "效果确认",
    effectDecision: "发动选择",
    activate: "是否使用效果",
    yes: "是",
    no: "否",
  },
  en: {
    self: "You",
    opponent: "Opponent",
    first: "First player",
    second: "Second player",
    option: "Selected option",
    type: "Declared card type",
    race: "Declared race",
    attribute: "Declared attribute",
    number: "Declared number",
    zone: "Selected zones",
    card: "Declared card",
    effect: "Effect hint",
    message: "Effect message",
    turn: "Turn count",
    cardDescriptionAdded: "Card hint applied",
    cardDescriptionRemoved: "Card hint ended",
    playerDescriptionAdded: "Player effect / restriction applied",
    playerDescriptionRemoved: "Player effect / restriction ended",
    coin: "Coin results",
    dice: "Dice results",
    yesNo: "Effect decision",
    effectDecision: "Activation decision",
    activate: "Use the effect",
    yes: "Yes",
    no: "No",
  },
  ja: {
    self: "自分",
    opponent: "相手",
    first: "先攻側",
    second: "後攻側",
    option: "選択結果",
    type: "宣言したカードの種類",
    race: "宣言した種族",
    attribute: "宣言した属性",
    number: "宣言した数値",
    zone: "選択したゾーン",
    card: "宣言したカード",
    effect: "効果のヒント",
    message: "効果のメッセージ",
    turn: "ターンカウント",
    cardDescriptionAdded: "カードのヒント適用",
    cardDescriptionRemoved: "カードのヒント終了",
    playerDescriptionAdded: "プレイヤーへの効果・制限適用",
    playerDescriptionRemoved: "プレイヤーへの効果・制限終了",
    coin: "コイントスの結果",
    dice: "サイコロの結果",
    yesNo: "効果の確認",
    effectDecision: "発動の選択",
    activate: "効果を使用する",
    yes: "はい",
    no: "いいえ",
  },
  ko: {
    self: "자신",
    opponent: "상대",
    first: "선공 측",
    second: "후공 측",
    option: "선택 결과",
    type: "선언한 카드 종류",
    race: "선언한 종족",
    attribute: "선언한 속성",
    number: "선언한 수치",
    zone: "선택한 존",
    card: "선언한 카드",
    effect: "효과 힌트",
    message: "효과 메시지",
    turn: "턴 카운트",
    cardDescriptionAdded: "카드 힌트 적용",
    cardDescriptionRemoved: "카드 힌트 종료",
    playerDescriptionAdded: "플레이어 효과 / 제한 적용",
    playerDescriptionRemoved: "플레이어 효과 / 제한 종료",
    coin: "코인 결과",
    dice: "주사위 결과",
    yesNo: "효과 확인",
    effectDecision: "발동 선택",
    activate: "효과 사용",
    yes: "예",
    no: "아니요",
  },
} as const;

export const duelResultMessages = (language: string) =>
  messages[language as Language] ?? messages.en;

const fallback = (value: number) => `#${value >>> 0}`;
const description = (value: number) => {
  const text = getStrings(value >>> 0);
  return text && text !== "?" && text !== "[?]" ? text : fallback(value);
};
const system = (id: number, value = id) => {
  const text = fetchStrings(Region.System, id);
  return text !== "?" ? text : fallback(value);
};

function bits(value: number, base: number, count: number): string {
  const names = Array.from({ length: count }, (_, bit) =>
    (value >>> bit) & 1 ? system(base + bit, 2 ** bit) : "",
  ).filter(Boolean);
  const unknown = (value >>> 0) & ~(2 ** count - 1);
  if (unknown) names.push(fallback(unknown));
  return names.join(" / ") || fallback(value);
}

/** Only a server-supplied description or card ID can identify a source card. */
export function duelResultSource(result: DuelResult): number {
  if (result.kind === "effect") return result.value >>> 0;
  if (
    result.kind === "option" ||
    result.kind === "yesNo" ||
    result.kind === "message" ||
    result.kind.endsWith("DescriptionAdded") ||
    result.kind.endsWith("DescriptionRemoved")
  ) {
    const value = "value" in result ? result.value >>> 0 : 0;
    return value >= 10000 ? value >>> 4 : 0;
  }
  return 0;
}

export function formatDuelResult(result: DuelResult, language: string) {
  const words = duelResultMessages(language);
  let title: string = words[result.kind];
  let value: string;
  switch (result.kind) {
    case "option":
      if ([70, 71, 72].includes(result.value)) title = words.type;
      value = description(result.value);
      break;
    case "race":
      value = bits(result.value, 1020, 26);
      break;
    case "attribute":
      value = bits(result.value, 1010, 7);
      break;
    case "number":
    case "turn":
      value = String(result.value);
      break;
    case "card":
    case "effect":
      value = fetchCard(result.value >>> 0).text.name ?? fallback(result.value);
      break;
    case "zone": {
      // Native zone masks are relative to the player in the hint.
      const zones: string[] = [];
      for (let side = 0; side < 2; side++) {
        const half = (result.value >>> (side * 16)) & 0xffff;
        for (let bit = 0; bit < 16; bit++) {
          if (!((half >>> bit) & 1)) continue;
          const label = side === 0 ? words.self : words.opponent;
          const name =
            bit < 7
              ? `${system(1002)} ${bit + 1}`
              : bit >= 8 && bit < 13
              ? `${system(1003)} ${bit - 7}`
              : bit === 13
              ? system(1008)
              : bit >= 14
              ? `${system(1009)} ${bit - 13}`
              : fallback(2 ** (bit + side * 16));
          zones.push(`${label} · ${name}`);
        }
      }
      value = zones.join(" / ") || fallback(result.value);
      break;
    }
    case "dice":
      value = result.values.join(" / ");
      break;
    case "coin":
      value = result.values.map((x) => system(61 - x, x)).join(" / ");
      break;
    case "yesNo":
    case "effectDecision": {
      const prompt =
        result.kind === "effectDecision" && [0, 221].includes(result.value)
          ? words.activate
          : description(result.value);
      value = `${prompt} · ${result.accepted ? words.yes : words.no}`;
      break;
    }
    default:
      value = description(result.value);
  }
  return { title, value };
}
