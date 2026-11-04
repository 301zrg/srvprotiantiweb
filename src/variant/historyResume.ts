import { ygopro } from "@/api/ocgcore/idl/ocgcore";
import {
  type History,
  type HistoryGame,
  historyStore,
} from "@/stores/historyStore";
import { storageKey } from "@/variant/deployment";

import { matchGame } from "./matchGame";

/** A player's log for a page reload or a tab the system killed: the host sends
 * reconnecting players the field, never the past. Per tab, and restored only
 * when the host itself offers to reconnect this identity to its game. */
const KEY = storageKey("duel-history-resume");
const MAX_AGE = 15 * 60_000;
const MAX_ROWS = 4000;
const LOCATIONS = [
  "currentLocation",
  "targetLocation",
  "attackTarget",
] as const;

interface SavedHistory {
  owner: string;
  savedAt: number;
  /** In a duel the host repeats MSG_START, which is not a new game. */
  inDuel: boolean;
  game: number;
  games: HistoryGame[];
  rows: History[];
}

let owner: string | undefined;

/** Names only: both fields may hold a password after "$". */
export function setHistoryOwner(
  join?: { player: string; passWd: string; spectate?: boolean } | undefined,
) {
  owner =
    join && !join.spectate
      ? JSON.stringify([join.player.split("$")[0], join.passWd.split("$")[0]])
      : undefined;
}

export function saveHistory(inDuel: boolean) {
  if (!owner || !historyStore.historys.length) return;
  const rows = historyStore.historys.slice(-MAX_ROWS).map((row) => {
    const plain = { ...row } as Record<string, unknown>;
    for (const key of LOCATIONS) {
      const location = row[key];
      if (location)
        plain[key] = {
          controller: location.controller,
          zone: location.zone,
          sequence: location.sequence,
          position: location.position,
          is_overlay: location.is_overlay,
          overlay_sequence: location.overlay_sequence,
        };
    }
    return plain;
  });
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        owner,
        savedAt: Date.now(),
        inDuel,
        game: matchGame.number,
        games: historyStore.games,
        rows,
      }),
    );
  } catch {
    // Optional: a full or blocked storage only loses this convenience.
  }
}

export function clearSavedHistory() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing was saved in that case either.
  }
}

/** The match is over: nothing can reconnect to it any more. */
export function forgetSavedHistory() {
  owner = undefined;
  clearSavedHistory();
}

/** Called on the host's reconnect offer to a connection without a live resume. */
export function restoreSavedHistory() {
  let saved: SavedHistory;
  try {
    saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
  } catch {
    return false;
  }
  if (
    !saved ||
    !owner ||
    saved.owner !== owner ||
    Date.now() - saved.savedAt > MAX_AGE ||
    !Array.isArray(saved.rows)
  )
    return false;
  historyStore.restoreMatch({
    rows: saved.rows.map((row) => {
      const restored = { ...row };
      for (const key of LOCATIONS) {
        const location = row[key];
        if (location) restored[key] = new ygopro.CardLocation(location);
      }
      return restored;
    }),
    games: saved.games ?? [],
    game: saved.game,
  });
  matchGame.resuming = saved.inDuel;
  return true;
}
