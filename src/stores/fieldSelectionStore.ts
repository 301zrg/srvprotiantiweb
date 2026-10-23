import { proxy } from "valtio";

import type { FieldSpot } from "@/variant/fieldSelection";

export interface FieldSelectionEntry {
  key: string;
  spot: FieldSpot;
  selected: boolean;
  fixed?: boolean;
}
export const fieldSelectionStore = proxy({
  active: false,
  entries: [] as FieldSelectionEntry[],
  focused: "",
});

export const fieldSpotKey = (spot: FieldSpot) =>
  `${spot.player}:${spot.location}:${spot.sequence}`;

/** Protobuf zones are ordinals; the shared display accepts native zone flags. */
export function onlineFieldSpot(location: {
  controller: number;
  zone: number;
  sequence: number;
  is_overlay?: boolean;
}): FieldSpot | undefined {
  if (location.is_overlay) return;
  const zone = location.zone;
  if (zone !== 2 && zone !== 3 && zone !== 8) return;
  return {
    player: location.controller,
    location: zone === 2 ? 4 : 8,
    sequence: zone === 8 ? 5 : location.sequence,
  };
}

let owner:
  | {
      token: symbol;
      toggle: (key: string) => void;
      cleanup: () => void;
    }
  | undefined;
let focusTimer: ReturnType<typeof setTimeout> | undefined;

export function clearFieldSelection() {
  owner?.cleanup();
  owner = undefined;
  clearTimeout(focusTimer);
  fieldSelectionStore.active = false;
  fieldSelectionStore.entries = [];
  fieldSelectionStore.focused = "";
}

/** A temporary UI bridge: it can toggle a draft, but has no transport access. */
export function bindFieldSelection(
  entries: FieldSelectionEntry[],
  toggle: (key: string) => void,
  signal?: AbortSignal,
) {
  clearFieldSelection();
  const token = Symbol("field-selection");
  const release = () => {
    if (owner?.token === token) clearFieldSelection();
  };
  if (!signal?.aborted) {
    owner = {
      token,
      toggle,
      cleanup: () => signal?.removeEventListener("abort", release),
    };
    fieldSelectionStore.active = true;
    fieldSelectionStore.entries = entries;
    signal?.addEventListener("abort", release, { once: true });
  }
  return {
    update(next: FieldSelectionEntry[]) {
      if (owner?.token === token) fieldSelectionStore.entries = next;
    },
    release,
  };
}

export function toggleFieldSelection(key: string) {
  if (!owner || !fieldSelectionStore.active) return false;
  const entry = fieldSelectionStore.entries.find((entry) => entry.key === key);
  if (!entry) return false;
  if (!entry.fixed) owner.toggle(key);
  return true;
}

export function focusFieldSelection(key: string) {
  if (!owner || !fieldSelectionStore.entries.some((entry) => entry.key === key))
    return;
  clearTimeout(focusTimer);
  fieldSelectionStore.focused = key;
  const token = owner.token;
  focusTimer = setTimeout(() => {
    if (owner?.token === token) fieldSelectionStore.focused = "";
  }, 1200);
}
