/** Board geometry shared by online duels, replays and the hand test.
 *
 * Pure: no store reads, no DOM writes. Mode adapters convert their own zone
 * encodings (online enum, Core bit masks) into a `BoardSpot`, and every card
 * position, zone outline and CSS variable is derived from the same numbers. */

export type BoardZone =
  | "deck"
  | "hand"
  | "monster"
  | "spell"
  | "grave"
  | "removed"
  | "extra";

/** `near` is the player at the bottom of the current view. */
export interface BoardSpot {
  zone: BoardZone;
  near: boolean;
  sequence: number;
}

export const baseGeometry = {
  BOARD_WIDTH: 1000,
  BOARD_HEIGHT: 920,
  MONSTER_ROW_Y: 130,
  SPELL_ROW_Y: 255,
  DECK_ROW_Y: 340,
  PERSPECTIVE: 1500,
  PLANE_ROTATE_X: 0,
  BLOCK_WIDTH: 120,
  BLOCK_HEIGHT_M: 120,
  BLOCK_HEIGHT_S: 110, // 魔法陷阱区
  ROW_GAP: 10,
  COL_GAP: 10,
  CARD_RATIO: 5.9 / 8.6,
  HAND_MARGIN_TOP: 0,
  HAND_CIRCLE_CENTER_OFFSET_Y: 6000,
  HAND_CARD_HEIGHT: 130,
  HAND_MAT_OFFSET_Y: 140, // 手卡离场地的偏移
  DECK_OFFSET_X: 140,
  DECK_OFFSET_Y: 80,
  DECK_ROTATE_Z: 30,
  DECK_CARD_HEIGHT: 120,
  CARD_HEIGHT_O: 100, // 场地魔法/墓地/除外的卡片高度
  BLOCK_OUTSIDE_OFFSET_X: 15,
};

export type BoardGeometry = {
  -readonly [K in keyof typeof baseGeometry]: number;
};

const units: Partial<Record<keyof BoardGeometry, string>> = {
  PLANE_ROTATE_X: "deg",
  DECK_ROTATE_Z: "deg",
  CARD_RATIO: "",
};

export interface BoardLayoutFlags {
  /** Landscape with a sidebar (≥ 480 px wide). */
  wide: boolean;
  /** Master rule; 4+ adds the extra monster row. */
  masterRule: number;
  /** PC/iPad sized: leave room for ATK/DEF under monsters. */
  roomy: boolean;
}

export const wideBoardQuery = "(orientation: landscape) and (min-width: 480px)";

export function boardGeometry({
  wide,
  masterRule,
  roomy,
}: BoardLayoutFlags): BoardGeometry {
  const g: BoardGeometry = {
    ...baseGeometry,
    ...(wide
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
      : {}),
  };
  if (wide && masterRule >= 4) g.BOARD_HEIGHT = 760;
  if (roomy) {
    const gap = wide ? 26 : 30;
    g.BOARD_HEIGHT += (gap - g.ROW_GAP) * 3;
    g.ROW_GAP = gap;
  }
  g.MONSTER_ROW_Y =
    masterRule >= 4
      ? g.BLOCK_HEIGHT_M + g.ROW_GAP
      : (g.BLOCK_HEIGHT_M + g.ROW_GAP) / 2;
  g.SPELL_ROW_Y =
    g.MONSTER_ROW_Y + (g.BLOCK_HEIGHT_M + g.BLOCK_HEIGHT_S) / 2 + g.ROW_GAP;
  g.DECK_ROW_Y =
    g.SPELL_ROW_Y + g.CARD_HEIGHT_O / 2 + g.DECK_CARD_HEIGHT / 2 + g.ROW_GAP;
  return g;
}

/** `BOARD_WIDTH` -> `--board-width: 1000px`, applied to a board root. */
export function geometryCssVars(g: BoardGeometry) {
  return Object.fromEntries(
    (Object.keys(baseGeometry) as (keyof BoardGeometry)[]).map((key) => [
      `--${key.toLowerCase().replaceAll("_", "-")}`,
      `${g[key]}${units[key] ?? "px"}`,
    ]),
  ) as Record<`--${string}`, string>;
}

export const boardScale = (
  g: BoardGeometry,
  width: number,
  height: number,
  max = 1.2,
) => Math.min(max, width / g.BOARD_WIDTH, height / g.BOARD_HEIGHT);

const columnX = (g: BoardGeometry, sequence: number) =>
  (sequence - 2) * (g.BLOCK_WIDTH + g.COL_GAP);
const outsideX = (g: BoardGeometry) =>
  g.BLOCK_WIDTH * 2.5 +
  g.COL_GAP * 2 +
  g.BLOCK_OUTSIDE_OFFSET_X +
  g.CARD_HEIGHT_O * g.CARD_RATIO * 0.5;
const deckX = (g: BoardGeometry) =>
  g.DECK_OFFSET_X + 2 * (g.BLOCK_WIDTH + g.COL_GAP);

export interface ZoneRect {
  /** Center, relative to the board center. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Outline of a slot or pile; the far side is the point mirror of the near. */
export function zoneRect(g: BoardGeometry, spot: BoardSpot): ZoneRect {
  let x = 0,
    y = 0,
    width = g.BLOCK_WIDTH,
    height = g.BLOCK_HEIGHT_M,
    rotation = 0;
  const pile = () => {
    height = g.CARD_HEIGHT_O;
    width = height * g.CARD_RATIO;
  };
  switch (spot.zone) {
    case "monster":
      if (spot.sequence > 4) {
        // 额外怪兽区
        x = (spot.sequence > 5 ? 1 : -1) * (g.BLOCK_WIDTH + g.COL_GAP);
      } else {
        x = columnX(g, spot.sequence);
        y = g.MONSTER_ROW_Y;
      }
      break;
    case "spell":
      y = g.SPELL_ROW_Y;
      if (spot.sequence === 5) {
        // 场地魔法
        pile();
        x = -outsideX(g);
      } else {
        x = columnX(g, spot.sequence);
        height = g.BLOCK_HEIGHT_S;
      }
      break;
    case "grave":
    case "removed":
      pile();
      x = outsideX(g);
      y = g.SPELL_ROW_Y;
      if (spot.zone === "removed") y -= g.ROW_GAP + g.CARD_HEIGHT_O;
      break;
    case "deck":
    case "extra":
      height = g.DECK_CARD_HEIGHT;
      width = height * g.CARD_RATIO;
      x = spot.zone === "deck" ? deckX(g) : -deckX(g);
      y = g.DECK_ROW_Y;
      rotation = spot.zone === "deck" ? -g.DECK_ROTATE_Z : g.DECK_ROTATE_Z;
      break;
    case "hand":
      width = g.HAND_CARD_HEIGHT * g.CARD_RATIO;
      height = g.HAND_CARD_HEIGHT;
      // Center card of the fan (angle 0).
      y =
        handCenterY(g) -
        (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT) +
        g.HAND_MAT_OFFSET_Y;
      break;
  }
  return spot.near
    ? { x, y, width, height, rotation }
    : { x: -x, y: -y, width, height, rotation: rotation + 180 };
}

const handCenterY = (g: BoardGeometry) =>
  g.BLOCK_HEIGHT_M +
  g.BLOCK_HEIGHT_S +
  2 * g.ROW_GAP +
  (g.HAND_MARGIN_TOP + g.HAND_CARD_HEIGHT + g.HAND_CIRCLE_CENTER_OFFSET_Y);

/** Keep the fan inside the host's slot; large stacks compress, never overflow. */
export function materialOffset(index: number, count: number, height: number) {
  const depth = (Math.max(1, count) - index) / Math.max(1, count);
  // Materials stay portrait; the full fan fits inside the 120px monster slot.
  const x =
    Math.max(0, Math.min(height * 0.22, (120 - height * (5.9 / 8.6)) / 2 - 2)) *
    depth;
  return { x, y: 0 };
}

export interface PoseInput {
  spot: BoardSpot;
  /** Cards in that player's hand (hand fan only). */
  handCount?: number;
  defense?: boolean;
  faceDown?: boolean;
  /** Material under a monster: its index and the host's material count. */
  overlay?: { index: number; count: number };
}

export interface CardPose {
  x: number;
  y: number;
  /** Depth used by the online 3D board for stacking. */
  z: number;
  height: number;
  /** Z rotation in degrees, including the far side's 180°. */
  rz: number;
  /** 180 when the card back faces the viewer. */
  ry: number;
  zIndex: number;
}

/** Resting position of a card; online springs animate towards it, offline
 * boards place it directly. */
export function cardPose(g: BoardGeometry, input: PoseInput): CardPose {
  const { spot, overlay } = input;
  const side = spot.near ? 0 : 180;
  if (spot.zone === "hand") {
    const handCount = input.handCount ?? 1;
    const width = g.CARD_RATIO * g.HAND_CARD_HEIGHT;
    const theta =
      2 *
      Math.atan(
        width / 2 / (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT),
      ) *
      0.9;
    const angle = (spot.sequence - (handCount - 1) / 2) * theta;
    const r = g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT / 2;
    const fanX = Math.sin(angle) * r;
    const y =
      handCenterY(g) -
      (Math.cos(angle) * r + g.HAND_CARD_HEIGHT / 2) +
      g.HAND_MAT_OFFSET_Y;
    const degrees = (angle * 180) / Math.PI;
    // Hands show their backs to the opponent unless the caller says otherwise.
    const handFaceDown = input.faceDown ?? !spot.near;
    return {
      // The far fan keeps the same screen order as the near one.
      x: fanX,
      y: spot.near ? y : -y,
      z: spot.sequence + 5,
      height: g.HAND_CARD_HEIGHT,
      rz: spot.near ? degrees : 180 - degrees,
      ry: handFaceDown ? 180 : 0,
      zIndex: spot.sequence,
    };
  }
  const rect = zoneRect(g, spot);
  if (spot.zone === "monster" || spot.zone === "spell") {
    let { x, y } = rect;
    let zIndex = 3;
    if (overlay) {
      const offset = materialOffset(overlay.index, overlay.count, rect.height);
      x += offset.x;
      y += offset.y;
      // Inner cards cover outer cards, leaving every fan edge exposed.
      zIndex = 2 - overlay.count + overlay.index;
    }
    return {
      x,
      y,
      z: 0,
      height: rect.height,
      rz: side + (!overlay && input.defense ? 90 : 0),
      ry: !overlay && input.faceDown ? 180 : 0,
      zIndex,
    };
  }
  return {
    x: rect.x,
    y: rect.y,
    z: spot.zone === "deck" || spot.zone === "extra" ? spot.sequence : 0,
    height: rect.height,
    rz: rect.rotation,
    ry: input.faceDown ? 180 : 0,
    zIndex: spot.sequence,
  };
}
