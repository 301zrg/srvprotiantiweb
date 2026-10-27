export interface CardIdentity {
  currentCode?: number;
  rank?: number;
}
export function updateOnlineIdentity(
  card: CardIdentity & {
    meta: {
      data: {
        type?: number;
        level?: number;
        race?: number;
        attribute?: number;
      };
    };
  },
  action: {
    queryFlags?: number;
    alias?: number;
    type_?: number;
    level?: number;
    rank?: number;
    race?: number;
    attribute?: number;
  },
) {
  const fields = [
    [8, "type_", "type"],
    [16, "level", "level"],
    [64, "attribute", "attribute"],
    [128, "race", "race"],
  ] as const;
  for (const [flag, key, target] of fields) {
    const value = action[key];
    if (
      action.queryFlags === undefined
        ? value !== undefined && value >= 0
        : !!(action.queryFlags & flag)
    )
      card.meta.data[target] = value;
  }
  if (action.queryFlags !== undefined && action.queryFlags & 4)
    card.currentCode = action.alias;
  if (action.queryFlags !== undefined && action.queryFlags & 32)
    card.rank = action.rank;
}
