import { siteStorage, storageKey } from "@/variant/deployment";

import { deckStore } from "./deckStore";

let selectedName: string | undefined;

export function selectActiveDeck(name: string) {
  selectedName = name;
  try {
    siteStorage.setItem("selectedDeckName", name);
  } catch {}
}

export function activeDeck() {
  if (selectedName === undefined) {
    try {
      selectedName =
        siteStorage.getItem("selectedDeckName") ??
        sessionStorage.getItem(storageKey("editingDeckName")) ??
        "";
    } catch {
      selectedName = "";
    }
  }
  return deckStore.get(selectedName) ?? deckStore.decks[0];
}
