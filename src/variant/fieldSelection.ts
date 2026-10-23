import { duelResultMessages } from "./duelResultMessages";
import type { Language } from "./languageLink";

/** Native/Core address, before any UI zone or perspective conversion. */
export interface FieldSpot {
  player: number;
  location: number;
  sequence: number;
}

export interface FieldPosition {
  column: number;
  columns: number;
  systemId: number;
  row: string;
  slot?: number;
}

export function fieldPosition(
  spot: FieldSpot,
  viewPlayer = 0,
): FieldPosition | undefined {
  const { player, location, sequence } = spot;
  if (![0, 1].includes(player) || !Number.isInteger(sequence) || sequence < 0)
    return;
  if (location === 8 && sequence === 5)
    return {
      column: 0,
      columns: 1,
      systemId: 1008,
      row: `${player}:8:field`,
    };
  if (![4, 8].includes(location) || sequence > 4) return;
  const column = player === viewPlayer ? sequence : 4 - sequence;
  return {
    column,
    columns: 5,
    systemId: location === 4 ? 1002 : 1003,
    row: `${player}:${location}`,
    slot: column + 1,
  };
}

const messages = {
  cn: {
    slot: (n: number) => `从左第 ${n} 格`,
    locate: "查看场上位置",
    back: "返回选牌",
    order: "按当前画面从左到右编号。",
  },
  en: {
    slot: (n: number) => `Slot ${n} from the left`,
    locate: "Locate on field",
    back: "Back to selection",
    order: "Slots are numbered left to right in the current view.",
  },
  ja: {
    slot: (n: number) => `左から${n}番目`,
    locate: "フィールド上の位置を確認",
    back: "カード選択に戻る",
    order: "現在の画面の左から右へ番号を付けます。",
  },
  ko: {
    slot: (n: number) => `왼쪽에서 ${n}번째 칸`,
    locate: "필드 위치 확인",
    back: "카드 선택으로 돌아가기",
    order: "현재 화면에서 왼쪽부터 오른쪽으로 번호를 표시합니다.",
  },
};

export const fieldSelectionMessages = (language: string) =>
  messages[language as Language] ?? messages.en;

export function fieldPositionLabel(
  spot: FieldSpot,
  viewPlayer: number,
  language: string,
  system: (id: number) => string,
  owner?: (player: number) => string,
): string {
  const position = fieldPosition(spot, viewPlayer);
  if (!position) return "";
  const words = duelResultMessages(language);
  return [
    owner?.(spot.player) ??
      (spot.player === viewPlayer ? words.self : words.opponent),
    system(position.systemId),
    ...(position.slot === undefined
      ? []
      : [fieldSelectionMessages(language).slot(position.slot)]),
  ].join(" · ");
}

export interface FieldSelectionSlot<T> {
  column: number;
  sequence: number;
  options: T[];
}

export interface FieldSelectionRow<T> {
  key: string;
  player: number;
  location: number;
  systemId: number;
  slots: FieldSelectionSlot<T>[];
}

/** Groups only supplied candidates; it never reads a field/store or renumbers options. */
export function fieldSelectionRows<T>(
  options: readonly T[],
  address: (option: T) => FieldSpot | undefined,
  viewPlayer = 0,
): { rows: FieldSelectionRow<T>[]; fallback: T[] } {
  const rows = new Map<string, FieldSelectionRow<T>>();
  const fallback: T[] = [];
  for (const option of options) {
    const spot = address(option);
    const position = spot && fieldPosition(spot, viewPlayer);
    if (!spot || !position) {
      fallback.push(option);
      continue;
    }
    let row = rows.get(position.row);
    if (!row) {
      row = {
        key: position.row,
        player: spot.player,
        location: spot.location,
        systemId: position.systemId,
        slots: Array.from({ length: position.columns }, (_, column) => ({
          column,
          sequence:
            position.columns === 1
              ? 5
              : spot.player === viewPlayer
              ? column
              : 4 - column,
          options: [],
        })),
      };
      rows.set(position.row, row);
    }
    row.slots[position.column].options.push(option);
  }
  const rank = (row: FieldSelectionRow<T>) => {
    const own = row.player === viewPlayer;
    if (row.systemId === 1008) return own ? 5 : 0;
    if (row.location === 8) return own ? 4 : 1;
    return own ? 3 : 2;
  };
  return {
    rows: [...rows.values()].sort((a, b) => rank(a) - rank(b)),
    fallback,
  };
}
