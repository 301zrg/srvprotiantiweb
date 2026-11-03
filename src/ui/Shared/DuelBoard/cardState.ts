import type { ReplayCard } from "@/replay/messages";

const words = {
  cn: {
    faceup: "表侧",
    facedown: "里侧",
    attack: "攻击表示",
    defense: "守备表示",
    set: "盖放",
    banished: "除外",
    hand: "手牌",
    deck: "主卡组",
    extra: "额外卡组",
    unknown: "状态未知",
    counters: "指示物",
    materials: "素材",
    disabled: "效果无效",
    forbidden: "不能使用",
    slot: "位置",
    declared: "宣言卡片",
    empty: "无",
    atk: "攻击力",
    def: "守备力",
  },
  en: {
    faceup: "Face-up",
    facedown: "Face-down",
    attack: "Attack position",
    defense: "Defense position",
    set: "Set",
    banished: "banished",
    hand: "Hand",
    deck: "Deck",
    extra: "Extra Deck",
    unknown: "Unknown position",
    counters: "Counters",
    materials: "Materials",
    disabled: "Effects negated",
    forbidden: "Forbidden",
    slot: "Slot",
    declared: "Declared card",
    empty: "None",
    atk: "ATK",
    def: "DEF",
  },
  ja: {
    faceup: "表側",
    facedown: "裏側",
    attack: "攻撃表示",
    defense: "守備表示",
    set: "セット",
    banished: "除外",
    hand: "手札",
    deck: "デッキ",
    extra: "EXデッキ",
    unknown: "表示形式不明",
    counters: "カウンター",
    materials: "素材",
    disabled: "効果無効",
    forbidden: "使用不可",
    slot: "位置",
    declared: "宣言カード",
    empty: "なし",
    atk: "攻撃力",
    def: "守備力",
  },
  ko: {
    faceup: "앞면",
    facedown: "뒷면",
    attack: "공격 표시",
    defense: "수비 표시",
    set: "세트",
    banished: "제외",
    hand: "패",
    deck: "덱",
    extra: "엑스트라 덱",
    unknown: "표시 형식 불명",
    counters: "카운터",
    materials: "소재",
    disabled: "효과 무효",
    forbidden: "사용 불가",
    slot: "위치",
    declared: "선언한 카드",
    empty: "없음",
    atk: "공격력",
    def: "수비력",
  },
};
export function replayCardWords(language: string) {
  return words[language as keyof typeof words] || words.cn;
}
export function isFaceDown(card: ReplayCard) {
  return !!(card.position & 10);
}
export function isDefense(card: ReplayCard) {
  return card.location === 4 && !!(card.position & 12);
}
/** What a replay viewer chose to see; both persist in the replay settings. */
export interface ReplayReveal {
  /** Face-down cards keep their back, made translucent over the face. */
  peek: boolean;
  /** Both hands face up. */
  hands: boolean;
}
/** Practice and other omniscient views: every identity is shown. */
export const REVEAL_ALL: ReplayReveal = { peek: true, hands: true };
/** True when only a card back is drawn and the identity stays hidden. */
export function concealReplayCard(card: ReplayCard, reveal: ReplayReveal) {
  if (card.location === 2) return !reveal.hands;
  return !reveal.peek && isFaceDown(card);
}
/** Face-down card shown through a translucent back; the position stays
 * explicit and the actual face-up/face-down state is unchanged. */
export function peekReplayCard(card: ReplayCard, reveal: ReplayReveal) {
  return reveal.peek && card.location !== 2 && isFaceDown(card);
}
export function positionLabel(card: ReplayCard, language: string) {
  const t = replayCardWords(language);
  const face = isFaceDown(card) ? t.facedown : t.faceup;
  if (card.location === 2) return t.hand;
  if (!card.position) return t.unknown;
  if (card.location === 4)
    return `${face} · ${isDefense(card) ? t.defense : t.attack}`;
  if (card.location === 8 && isFaceDown(card)) return t.set;
  if (card.location === 32) return `${face} · ${t.banished}`;
  if (card.location === 1) return `${t.deck} · ${face}`;
  if (card.location === 64) return `${t.extra} · ${face}`;
  return face;
}
export function replayCounters(card: ReplayCard) {
  return card.counters
    .map((n) => ({ type: n & 65535, count: n >>> 16 }))
    .filter((c) => c.count > 0);
}
