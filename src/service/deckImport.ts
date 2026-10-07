import { fetchCard } from "@/api/cards";
import { isExtraDeckCard } from "@/common";
import { deckStore } from "@/stores/deckStore";
import {
  type DeckImportInput,
  deckImportTitle,
  parseDeckInput,
} from "@/variant/deckImport";

export function importedCardZone(id: number): "main" | "extra" | undefined {
  const type = fetchCard(id).data.type;
  if (!type) return;
  return isExtraDeckCard(type) ? "extra" : "main";
}

export async function importDeckContent(
  input: DeckImportInput,
  title: string,
  fallbackTitle: string,
  zoneOverrides: Record<number, "main" | "extra"> = {},
) {
  const lists = parseDeckInput(
    input,
    (id) => zoneOverrides[id] ?? importedCardZone(id),
  );
  const result = await deckStore.importDeck({
    ...lists,
    deckName: deckImportTitle(title) || fallbackTitle,
  });
  const unknown = [...lists.main, ...lists.extra, ...lists.side].filter(
    (id) => !fetchCard(id).data.type,
  ).length;
  return { ...result, unknown };
}
