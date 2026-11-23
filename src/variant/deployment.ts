/**
 * Single entry point for browser storage key names. Every published build uses
 * the plain key; keep callers going through here so a future hosting target
 * can namespace keys without touching each store.
 */
export function storageKey(key: string): string {
  return key;
}

export const siteStorage = {
  getItem(key: string) {
    return localStorage.getItem(storageKey(key));
  },
  setItem(key: string, value: string) {
    localStorage.setItem(storageKey(key), value);
  },
  removeItem(key: string) {
    localStorage.removeItem(storageKey(key));
  },
};
