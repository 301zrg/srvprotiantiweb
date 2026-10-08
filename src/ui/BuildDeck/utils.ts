import { type CardMeta, fetchCard } from "@/api";
import { tellCardBasicType, tellCardSecondaryType } from "@/common";
import { downloadFile, shareOrDownloadFile } from "@/infra/fileExport";
import { type IDeck } from "@/stores";

/** 用在卡组编辑 */
export interface EditingDeck {
  deckName: string;
  main: CardMeta[];
  extra: CardMeta[];
  side: CardMeta[];
}

export const iDeckToEditingDeck = async (
  ideck: IDeck,
): Promise<EditingDeck> => ({
  deckName: ideck.deckName,
  main: await Promise.all(ideck.main.map(fetchCard)),
  extra: await Promise.all(ideck.extra.map(fetchCard)),
  side: await Promise.all(ideck.side.map(fetchCard)),
});

export const editingDeckToIDeck = (deck: EditingDeck): IDeck => ({
  deckName: deck.deckName,
  main: deck.main.map((card) => card.id),
  extra: deck.extra.map((card) => card.id),
  side: deck.side.map((card) => card.id),
});

/** 卡组内部排序，给array.sort用 */
export const compareCards = (a: CardMeta, b: CardMeta): number => {
  const aType = tellCardBasicType(a.data.type ?? 0);
  const bType = tellCardBasicType(b.data.type ?? 0);
  if (aType !== bType) return aType - bType;
  const aSecondaryType = tellCardSecondaryType(a.data.type ?? 0);
  const bSecondaryType = tellCardSecondaryType(b.data.type ?? 0);
  if (aSecondaryType !== bSecondaryType) return aSecondaryType - bSecondaryType;
  return a.id - b.id;
};

/** 生成ydk格式的卡组文本 */
export function genYdkText(deck: IDeck): string {
  const { main, extra, side } = deck;

  const lines = [
    "#created by neos",
    "#main",
    ...main.map((cardId) => cardId.toString()),
    "#extra",
    ...extra.map((cardId) => cardId.toString()),
    "!side",
    ...side.map((cardId) => cardId.toString()),
  ];
  return lines.join("\n");
}

/** 下载卡组YDK文件 **/
export function downloadDeckAsYDK(deck: IDeck) {
  downloadFile(deckAsYdkFile(deck));
}

export function deckAsYdkFile(deck: IDeck) {
  const name =
    deck.deckName
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
      .replace(/\.ydk$/i, "")
      .trim()
      .slice(0, 120) || "deck";
  return new File([genYdkText(deck)], `${name}.ydk`, { type: "text/plain" });
}

export function shareDeckAsYDK(deck: IDeck) {
  return shareOrDownloadFile(deckAsYdkFile(deck), deck.deckName);
}

/** 将卡组复制到剪贴板 */
export async function copyDeckToClipboard(deck: IDeck): Promise<boolean> {
  const text = genYdkText(deck);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}
