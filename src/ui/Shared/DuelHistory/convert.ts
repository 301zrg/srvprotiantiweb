import { fetchStrings, Region } from "@/api";
import { corePhaseKey, type PhaseKey } from "@/variant/duelPhases";
import type { DuelResult } from "@/variant/duelResults";

import type { SceneAction } from "../DuelBoard/scene";
import {
  corePlace,
  type DuelHistoryEntry,
  type HistoryKind,
  keepsPhase,
} from ".";

/** Card code at a spot, for messages that only name the spot (attacks). */
export type CodeAt = (spot: {
  player: number;
  location: number;
  sequence: number;
}) => number | undefined;

/** As the online log: summons, sets and activations already name the card
 * entering the field, so only other moves to a monster zone get a row. */
const keepsMove = (to: { location: number } | undefined, reason = 0) =>
  !to ||
  (to.location !== 4 && to.location !== 8) ||
  (to.location === 4 && reason !== 0);

/** Turn and phase while walking a log; phase rows depend on the last one. */
export interface HistoryCursor {
  turn: number;
  phase?: PhaseKey;
}

const sceneKinds: Record<string, HistoryKind> = {
  move: "move",
  set: "set",
  summon: "summon",
  special: "special",
  flip: "flip",
  chain: "effect",
  attack: "attack",
  draw: "draw",
  damage: "damage",
  recover: "recover",
  lp: "lp",
  turn: "turn",
  phase: "phase",
  position: "position",
};

/** Hand test: one scene action (with the turn/phase of its step). */
export function sceneHistoryEntry(
  action: SceneAction,
  turn: number,
  phase: number,
  cursor: HistoryCursor,
  result?: DuelResult,
  codeAt?: CodeAt,
): DuelHistoryEntry | undefined {
  const key = corePhaseKey(phase);
  const previous = cursor.phase;
  cursor.turn = turn;
  cursor.phase = key;
  if (result)
    return {
      kind: "result",
      result,
      code: action.code,
      player: action.player ?? action.to?.player ?? action.from?.player,
      turn,
      phase: key,
    };
  const kind = sceneKinds[action.kind];
  if (!kind) return;
  if (kind === "phase" && !keepsPhase(key, previous)) return;
  if (kind === "move" && !keepsMove(action.to, action.reason)) return;
  if (kind === "turn") cursor.phase = undefined;
  const summon = ["summon", "special", "flip", "set"].includes(kind);
  const direct = kind === "attack" && action.to && !action.to.location;
  return {
    kind,
    code: action.code ?? (action.from && codeAt?.(action.from)),
    player:
      kind === "move"
        ? action.from?.player
        : action.player ?? action.to?.player ?? action.from?.player,
    turn,
    phase: key,
    amount: action.amount,
    // Chain activations carry their card's spot as `to`.
    from:
      kind === "effect"
        ? action.to && corePlace(action.to)
        : summon || !action.from
        ? undefined
        : corePlace(action.from),
    to: direct
      ? { zone: 0, direct: true }
      : summon || kind === "move" || kind === "attack"
      ? action.to && corePlace(action.to)
      : undefined,
  };
}

const spot = (event: number[], offset: number) => ({
  player: event[offset],
  location: event[offset + 1],
  sequence: event[offset + 2],
});
const packed = (event: number[], offset: number) =>
  new DataView(new Uint8Array(event).buffer).getUint32(offset, true);

/** Replays: the raw Core messages of one step, in order. */
export function eventHistoryEntries(
  events: number[][],
  cursor: HistoryCursor,
  codeAt?: CodeAt,
): DuelHistoryEntry[] {
  const entries: DuelHistoryEntry[] = [];
  const push = (entry: Omit<DuelHistoryEntry, "turn" | "phase">) =>
    entries.push({ ...entry, turn: cursor.turn, phase: cursor.phase });
  for (const e of events) {
    const kind = e[0];
    if (kind === 40) {
      cursor.turn++;
      cursor.phase = undefined;
      push({ kind: "turn", player: e[1] });
    } else if (kind === 41) {
      const previous = cursor.phase;
      cursor.phase = corePhaseKey(e[1] | (e[2] << 8));
      if (keepsPhase(cursor.phase, previous)) push({ kind: "phase" });
    } else if (kind === 50) {
      const from = spot(e, 5),
        to = spot(e, 9);
      if (!keepsMove(to, packed(e, 13))) continue;
      push({
        kind: "move",
        code: packed(e, 1),
        player: from.player,
        from: corePlace(from),
        to: corePlace(to),
      });
    } else if (kind === 53) {
      const at = spot(e, 5);
      push({
        kind: "position",
        code: packed(e, 1),
        player: at.player,
        from: corePlace(at),
      });
    } else if ([54, 60, 62, 64].includes(kind)) {
      const at = spot(e, 5);
      push({
        kind:
          kind === 54
            ? "set"
            : kind === 60
            ? "summon"
            : kind === 62
            ? "special"
            : "flip",
        code: packed(e, 1),
        player: at.player,
        to: corePlace(at),
      });
    } else if (kind === 70) {
      const at = spot(e, 5);
      push({
        kind: "effect",
        code: packed(e, 1),
        player: at.player,
        from: corePlace(at),
      });
    } else if (kind === 90) push({ kind: "draw", player: e[1], amount: e[2] });
    else if ([91, 92, 94, 100].includes(kind))
      push({
        kind: kind === 92 ? "recover" : kind === 94 ? "lp" : "damage",
        player: e[1],
        amount: packed(e, 2),
      });
    else if (kind === 110) {
      const from = spot(e, 1),
        to = spot(e, 5);
      push({
        kind: "attack",
        code: codeAt?.(from),
        player: from.player,
        from: corePlace(from),
        to: to.location ? corePlace(to) : { zone: 0, direct: true },
      });
    } else if (kind === 2 && [8, 10].includes(e[1]))
      push({ kind: "announce", player: e[2], code: packed(e, 3) });
    else if (kind === 160 && e[5] === 2)
      push({ kind: "announce", code: packed(e, 6) });
    else if (kind === 5)
      push({
        kind: "win",
        player: e[1] < 2 ? e[1] : undefined,
        text: fetchStrings(Region.Victory, `0x${e[2].toString(16)}`),
      });
  }
  return entries;
}
