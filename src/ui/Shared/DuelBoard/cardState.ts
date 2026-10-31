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
    reveal: "查看里侧卡片",
    revealNote: "查看内容不会改变卡片的实际表里侧状态。",
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
    reveal: "Reveal face-down cards",
    revealNote: "Revealing a card does not change its actual position.",
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
    reveal: "裏側カードを確認",
    revealNote: "内容を確認しても実際の表示形式は変わりません。",
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
    reveal: "뒷면 카드 확인",
    revealNote: "내용을 확인해도 실제 표시 형식은 변하지 않습니다.",
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
export function concealReplayCard(card: ReplayCard, reveal: boolean) {
  // A replay may show both hands; field and pile positions remain explicit.
  return !reveal && card.location !== 2 && isFaceDown(card);
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
