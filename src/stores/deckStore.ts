import { clear, createStore, del, values } from "idb-keyval";
import { proxy } from "valtio";

import { storageKey } from "@/variant/deployment";

import { type NeosStore } from "./shared";

const IDB_NAME = "decks";
let deckIdb: ReturnType<typeof createStore> | undefined;
const getDeckIdb = () =>
  (deckIdb ??= createStore(storageKey(IDB_NAME), IDB_NAME));

export interface IDeck {
  deckName: string;
  main: number[];
  extra: number[];
  side: number[];
}

export const emptyDeck: IDeck = { deckName: "", main: [], extra: [], side: [] };

export interface DeckImportSaveResult {
  deck: IDeck;
  persisted: boolean;
  reused: boolean;
}

const sameCards = (a: IDeck, b: IDeck) =>
  (["main", "extra", "side"] as const).every(
    (zone) =>
      Array.isArray(a[zone]) &&
      a[zone].length === b[zone].length &&
      a[zone].every((id, i) => id === b[zone][i]),
  );

function uniqueName(name: string, decks: IDeck[]) {
  let result = name;
  for (let i = 2; decks.some((deck) => deck.deckName === result); i++)
    result = `${name} (${i})`;
  return result;
}

export const deckStore = proxy({
  decks: [] as IDeck[],
  persistenceAvailable: true,

  get(deckName: string) {
    return deckStore.decks.find((deck) => deck.deckName === deckName);
  },

  async update(deckName: string, deck: IDeck): Promise<boolean> {
    const index = deckStore.decks.findIndex(
      (deck) => deck.deckName === deckName,
    );
    if (index === -1) {
      // if not existed, create one
      return deckStore.add(deck);
    } else {
      try {
        const updated = await getDeckIdb()(
          "readwrite",
          (store) =>
            new Promise<boolean>((resolve, reject) => {
              let changed = false;
              store.transaction.oncomplete = () => resolve(changed);
              store.transaction.onabort = store.transaction.onerror = () =>
                reject(store.transaction.error);
              store.get(deck.deckName).onsuccess = (event) => {
                try {
                  if (
                    deck.deckName !== deckName &&
                    (event.target as IDBRequest).result
                  )
                    return;
                  store.put(deck, deck.deckName);
                  if (deck.deckName !== deckName) store.delete(deckName);
                  changed = true;
                } catch (error) {
                  reject(error);
                  store.transaction.abort();
                }
              };
            }),
        );
        if (updated) deckStore.decks[index] = deck;
        return updated;
      } catch {
        deckStore.persistenceAvailable = false;
        return false;
      }
    }
  },

  async add(deck: IDeck): Promise<boolean> {
    if (deckStore.decks.find((d) => d.deckName === deck.deckName)) return false;
    try {
      const added = await getDeckIdb()(
        "readwrite",
        (store) =>
          new Promise<boolean>((resolve, reject) => {
            let added = true;
            store.transaction.oncomplete = () => resolve(added);
            store.transaction.onabort = store.transaction.onerror = () =>
              reject(store.transaction.error);
            const request = store.add(deck, deck.deckName);
            request.onerror = (event) => {
              if (request.error?.name === "ConstraintError") {
                event.preventDefault();
                event.stopPropagation();
                added = false;
              }
            };
          }),
      );
      if (!added) return false;
      deckStore.decks.push(deck);
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "ConstraintError"))
        deckStore.persistenceAvailable = false;
      return false;
    }
  },

  /** Name allocation and duplicate checks share one transaction, including across tabs. */
  async importDeck(deck: IDeck): Promise<DeckImportSaveResult> {
    try {
      const result = await getDeckIdb()(
        "readwrite",
        (store) =>
          new Promise<DeckImportSaveResult>((resolve, reject) => {
            let saved: DeckImportSaveResult;
            store.transaction.oncomplete = () => resolve(saved);
            store.transaction.onabort = store.transaction.onerror = () =>
              reject(store.transaction.error);
            store.getAll().onsuccess = (event) => {
              try {
                const existing = (event.target as IDBRequest<IDeck[]>).result;
                const duplicate = existing.find((old) => sameCards(old, deck));
                if (duplicate)
                  saved = { deck: duplicate, persisted: true, reused: true };
                else {
                  const name = uniqueName(
                    deck.deckName,
                    existing.concat(deckStore.decks),
                  );
                  const fresh = { ...deck, deckName: name };
                  store.add(fresh, name);
                  saved = { deck: fresh, persisted: true, reused: false };
                }
              } catch (error) {
                reject(error);
                store.transaction.abort();
              }
            };
          }),
      );
      const index = deckStore.decks.findIndex(
        (old) => old.deckName === result.deck.deckName,
      );
      if (index < 0) deckStore.decks.push(result.deck);
      else deckStore.decks[index] = result.deck;
      return result;
    } catch {
      deckStore.persistenceAvailable = false;
      const duplicate = deckStore.decks.find((old) => sameCards(old, deck));
      if (duplicate) return { deck: duplicate, persisted: false, reused: true };
      const fresh = {
        ...deck,
        deckName: uniqueName(deck.deckName, deckStore.decks),
      };
      deckStore.decks.push(fresh);
      return { deck: fresh, persisted: false, reused: false };
    }
  },

  async delete(deckName: string): Promise<boolean> {
    const index = deckStore.decks.findIndex(
      (deck) => deck.deckName === deckName,
    );
    if (index === -1) return false;
    await del(deckName, getDeckIdb());
    deckStore.decks.splice(index, 1);
    return true;
  },

  async initialize() {
    try {
      deckStore.decks = await values<IDeck>(getDeckIdb());
    } catch {
      deckStore.persistenceAvailable = false;
    }
    if (!deckStore.decks.length) {
      // 给玩家预设了几套卡组，一旦idb为空，就会给玩家添加这几套卡组
      const PRESET_DECKS: Record<string, { default: Omit<IDeck, "deckName"> }> =
        import.meta.glob("/neos-assets/structure-decks/1103-sample.ydk", {
          eager: true,
        });
      for (const key in PRESET_DECKS) {
        const deck = PRESET_DECKS[key].default;
        const deckName =
          key.split("/").pop()?.split(".").slice(0, -1).join(".") ??
          "undefined"; // 从路径解析文件名
        const preset = { ...deck, deckName };
        if (!deckStore.persistenceAvailable || !(await deckStore.add(preset)))
          deckStore.decks.push(preset);
      }
    }
  },
  async reset() {
    await clear(getDeckIdb());
    deckStore.decks = [];
  },
}) satisfies NeosStore;
