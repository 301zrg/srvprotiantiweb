export interface CardStats {
  attack?: number;
  defense?: number;
  baseAttack?: number;
  baseDefense?: number;
  printedAttack?: number;
  printedDefense?: number;
  hasDefense?: boolean;
}
const known = (value?: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
export function statText(value?: number) {
  return known(value) ? String(value) : "?";
}
export function statTrend(current?: number, original?: number) {
  if (!known(current) || !known(original)) return "unknown";
  return current > original ? "higher" : current < original ? "lower" : "equal";
}
export function showPrintedStats(stats: CardStats) {
  const printedValue = (value?: number) =>
    known(value) || value === -1 || value === -2;
  return (
    (printedValue(stats.printedAttack) &&
      stats.printedAttack !== stats.baseAttack) ||
    (stats.hasDefense !== false &&
      printedValue(stats.printedDefense) &&
      stats.printedDefense !== stats.baseDefense)
  );
}

/** Native flags distinguish omitted fields from real zero/unknown values. */
export function updateOnlineStats(
  card: {
    meta: { data: { atk?: number; def?: number } };
    baseAttack?: number;
    baseDefense?: number;
  },
  action: {
    queryFlags?: number;
    attack?: number;
    defense?: number;
    base_attack?: number;
    base_defense?: number;
  },
) {
  const present = (flag: number, value?: number) =>
    action.queryFlags === undefined
      ? value !== undefined && value >= 0
      : (action.queryFlags & flag) !== 0;
  if (present(0x100, action.attack)) card.meta.data.atk = action.attack;
  if (present(0x200, action.defense)) card.meta.data.def = action.defense;
  if (action.queryFlags !== undefined && action.queryFlags & 0x400)
    card.baseAttack = action.base_attack;
  if (action.queryFlags !== undefined && action.queryFlags & 0x800)
    card.baseDefense = action.base_defense;
}

export interface StatRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Screen-space placement keeps numbers upright and leaves the next card free. */
/** Screens large enough (PC, iPad) to print ATK/DEF under monster cards. */
export const roomyStatsQuery = "(min-width: 700px) and (min-height: 600px)";

export function placeFieldStats(
  card: StatRect,
  obstacles: readonly StatRect[],
  clip: StatRect,
  textWidth: number,
  columnWidth = card.width,
) {
  const width = textWidth + 8,
    height = 18;
  if (width > columnWidth + 2) return;
  const x = card.x + (card.width - width) / 2,
    y = card.y + card.height + 1;
  if (
    x < clip.x ||
    x + width > clip.x + clip.width ||
    y + height > clip.y + clip.height
  )
    return;
  if (
    obstacles.some(
      (r) =>
        r.y >= card.y + card.height - 1 &&
        r.y < y + height + 1 &&
        r.x < x + width &&
        r.x + r.width > x,
    )
  )
    return;
  return { x, y, width, height };
}
