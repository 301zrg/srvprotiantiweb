import { roomyStatsQuery } from "@/variant/cardStats";

// 此文件目的是在js和CSS之间共享一些变量，并且这些变量是0运行时的。
type CSSConfig = [string, [number, UNIT]][];

/** 转为CSS变量: BOARD_ROTATE_Z -> --board-rotate-z */
const toCssProperties = (config: CSSConfig) =>
  config
    .map(
      ([k, v]) =>
        [
          `--${k
            .split("_")
            .map((s) => s.toLowerCase())
            .join("-")}`,
          `${v[0]}${v[1]}`,
        ] as [string, string],
    )
    .reduce((acc, cur) => [...acc, cur], [] as [string, string][]);

enum UNIT {
  PX = "px",
  DEG = "deg",
  NONE = "",
}

const _matConfigWithUnit = {
  BOARD_WIDTH: [1000, UNIT.PX],
  BOARD_HEIGHT: [920, UNIT.PX],
  MONSTER_ROW_Y: [130, UNIT.PX],
  SPELL_ROW_Y: [255, UNIT.PX],
  DECK_ROW_Y: [340, UNIT.PX],
  PERSPECTIVE: [1500, UNIT.PX],
  PLANE_ROTATE_X: [0, UNIT.DEG],
  BLOCK_WIDTH: [120, UNIT.PX],
  BLOCK_HEIGHT_M: [120, UNIT.PX],
  BLOCK_HEIGHT_S: [110, UNIT.PX], // 魔法陷阱区
  ROW_GAP: [10, UNIT.PX],
  COL_GAP: [10, UNIT.PX],
  CARD_RATIO: [5.9 / 8.6, UNIT.NONE],
  HAND_MARGIN_TOP: [0, UNIT.PX],
  HAND_CIRCLE_CENTER_OFFSET_Y: [6000, UNIT.PX],
  HAND_CARD_HEIGHT: [130, UNIT.PX],
  HAND_MAT_OFFSET_Y: [140, UNIT.PX], // 手卡离场地的偏移
  DECK_OFFSET_X: [140, UNIT.PX],
  DECK_OFFSET_Y: [80, UNIT.PX],
  DECK_ROTATE_Z: [30, UNIT.DEG],
  DECK_CARD_HEIGHT: [120, UNIT.PX],
  CARD_HEIGHT_O: [100, UNIT.PX], // 场地魔法/墓地/除外的卡片高度
  BLOCK_OUTSIDE_OFFSET_X: [15, UNIT.PX],
} satisfies Record<string, [number, UNIT]>;

const matConfigWithUnit = Object.entries(
  _matConfigWithUnit,
) satisfies CSSConfig;

export function setCssProperties() {
  toCssProperties(matConfigWithUnit).forEach(([k, v]) => {
    document.body.style.setProperty(k, v);
  });
}

export const matConfig = matConfigWithUnit.reduce(
  (prev, [key, value]) => ({
    ...prev,
    // @ts-ignore
    [key]: value[0],
  }),
  {} as Record<keyof typeof _matConfigWithUnit, number>,
);

/** CSS and animation coordinates share the same responsive geometry. */
export function updateMatLayout(wide: boolean, masterRule: number) {
  const compact = wide
    ? {
        BLOCK_HEIGHT_M: 88,
        BLOCK_HEIGHT_S: 88,
        ROW_GAP: 8,
        COL_GAP: 8,
        CARD_HEIGHT_O: 86,
        HAND_CARD_HEIGHT: 120,
        HAND_MAT_OFFSET_Y: 68,
        DECK_OFFSET_X: 132,
        DECK_OFFSET_Y: 8,
        DECK_ROTATE_Z: 0,
        DECK_CARD_HEIGHT: 100,
        BOARD_HEIGHT: 680,
      }
    : {};
  const next = {
    ...Object.fromEntries(matConfigWithUnit.map(([k, [v]]) => [k, v])),
    ...compact,
  } as typeof matConfig;
  if (wide && masterRule >= 4) next.BOARD_HEIGHT = 760;
  // PC and iPad (either orientation) leave room under monsters for the
  // ATK/DEF line; phones keep the tight rows.
  if (window.matchMedia(roomyStatsQuery).matches) {
    const gap = wide ? 26 : 30;
    next.BOARD_HEIGHT += (gap - next.ROW_GAP) * 3;
    next.ROW_GAP = gap;
  }
  next.MONSTER_ROW_Y =
    masterRule >= 4
      ? next.BLOCK_HEIGHT_M + next.ROW_GAP
      : (next.BLOCK_HEIGHT_M + next.ROW_GAP) / 2;
  next.SPELL_ROW_Y =
    next.MONSTER_ROW_Y +
    (next.BLOCK_HEIGHT_M + next.BLOCK_HEIGHT_S) / 2 +
    next.ROW_GAP;
  next.DECK_ROW_Y =
    next.SPELL_ROW_Y +
    next.CARD_HEIGHT_O / 2 +
    next.DECK_CARD_HEIGHT / 2 +
    next.ROW_GAP;
  const changed = Object.keys(next).some(
    (k) => next[k as keyof typeof next] !== matConfig[k as keyof typeof next],
  );
  Object.assign(matConfig, next);
  for (const [key, [, unit]] of matConfigWithUnit) {
    document.body.style.setProperty(
      `--${key.toLowerCase().replaceAll("_", "-")}`,
      `${matConfig[key as keyof typeof matConfig]}${unit}`,
    );
  }
  return changed;
}
