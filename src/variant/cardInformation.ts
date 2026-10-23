/** Core-owned lasting links; unrelated to the current chain's target markers. */
export interface CardLinks {
  equipTarget?: string;
  cardTargets?: readonly string[];
}
export interface IdentifiedCardLinks extends CardLinks {
  id: string;
}
export interface CardLinkEdge {
  source: string;
  target: string;
  kind: "equip" | "card";
}

export function relatedCardLinks(
  cards: readonly IdentifiedCardLinks[],
  id?: string,
): CardLinkEdge[] {
  if (!id) return [];
  const ids = new Set(cards.map((card) => card.id));
  return cards.flatMap((card) => {
    const edges: CardLinkEdge[] = [];
    if (card.equipTarget)
      edges.push({ source: card.id, target: card.equipTarget, kind: "equip" });
    for (const target of card.cardTargets ?? [])
      edges.push({ source: card.id, target, kind: "card" });
    return edges.filter(
      (edge) =>
        ids.has(edge.target) && (edge.source === id || edge.target === id),
    );
  });
}

export function clearCardLinks<T extends CardLinks>(
  cards: T[],
  id: string,
  identify: (card: T) => string,
  includeEquip = true,
) {
  for (const card of cards) {
    if (includeEquip && (identify(card) === id || card.equipTarget === id))
      delete card.equipTarget;
    if (identify(card) === id) card.cardTargets = [];
    else if (card.cardTargets?.includes(id))
      card.cardTargets = card.cardTargets.filter((target) => target !== id);
  }
}

export function counterEntries(
  counters: Readonly<Record<number, number>> | readonly number[],
): { type: number; count: number }[] {
  const entries = Array.isArray(counters)
    ? counters.map((n) => ({ type: n & 65535, count: n >>> 16 }))
    : Object.entries(counters).map(([type, count]) => ({
        type: Number(type),
        count,
      }));
  return entries
    .filter((entry) => entry.count > 0)
    .sort((a, b) => a.type - b.type);
}

const counterColors = [
  "#88cfff",
  "#ffcf72",
  "#caacff",
  "#8fe0b0",
  "#ffabc7",
  "#9ee2e4",
];
export function counterColor(type: number): string {
  return counterColors[(type >>> 0) % counterColors.length];
}

const linkWords = {
  cn: { related: "关联卡片" },
  en: { related: "Related cards" },
  ja: { related: "関連カード" },
  ko: { related: "관련 카드" },
};
export function cardLinkWords(language: string) {
  return linkWords[language as keyof typeof linkWords] ?? linkWords.cn;
}
