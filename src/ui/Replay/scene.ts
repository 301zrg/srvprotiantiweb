import type { ReplayFrame } from "@/replay/engine";
import type { ReplayCard } from "@/replay/messages";

export type SceneCard = ReplayCard & { sceneId: string };
export interface Spot {
  player: number;
  location: number;
  sequence: number;
}
export interface SceneAction {
  kind: string;
  code?: number;
  player?: number;
  from?: Spot;
  to?: Spot;
  amount?: number;
  arrivals?: string[];
  moving?: SceneCard;
}
export type SceneFrame = Omit<ReplayFrame, "cards"> & {
  cards: SceneCard[];
  action?: SceneAction;
  chains: (Spot & { code: number; index: number })[];
};
const spot = (event: number[], offset: number): Spot => ({
  player: event[offset],
  location: event[offset + 1],
  sequence: event[offset + 2],
});
const same = (card: Spot, place: Spot) =>
  card.player === place.player &&
  card.location === place.location &&
  card.sequence === place.sequence;
const packed = (event: number[], offset: number) =>
  new DataView(new Uint8Array(event).buffer).getUint32(offset, true);
const compact = (location: number) => [1, 2, 16, 32, 64].includes(location);
const copy = (card: SceneCard): SceneCard => ({
  ...card,
  overlay: [...card.overlay],
  counters: [...card.counters],
});
export function seedScene(
  frame: ReplayFrame,
  previous?: SceneFrame,
): SceneFrame {
  return {
    ...frame,
    // A fresh query after restart/seek cannot inherit markers from the old turn.
    // Ordinary queued batches restore their live chain state explicitly below.
    chains: [],
    cards: frame.cards.map((c) => ({
      ...c,
      sceneId:
        previous?.cards.find((old) => same(old, c) && old.code === c.code)
          ?.sceneId ||
        `${frame.step}:${c.player}:${c.location}:${c.sequence}:${c.code}`,
    })),
  };
}

/** Replay events drive visible intermediate actions; every batch ends at the
 * complete, uncached Core query. Display reconstruction never supplies input
 * to the engine and cannot alter the actual replay result. */
export function sceneSteps(
  previous: SceneFrame,
  next: ReplayFrame,
): SceneFrame[] {
  let scene: SceneFrame = {
    ...previous,
    step: next.step,
    consumed: next.consumed,
    total: next.total,
    end: undefined,
    cards: previous.cards.map(copy),
    chains: [...previous.chains],
  };
  const steps: SceneFrame[] = [];
  const emit = (action: SceneAction) => {
    scene = {
      ...scene,
      action,
      cards: scene.cards.map(copy),
      chains: [...scene.chains],
    };
    steps.push(scene);
  };
  for (const [i, event] of next.events.entries()) {
    scene = {
      ...scene,
      cards: scene.cards.map(copy),
      chains: [...scene.chains],
    };
    const kind = event[0];
    if (kind === 50) {
      const from = spot(event, 5),
        to = spot(event, 9),
        code = packed(event, 1);
      let moved: SceneCard | undefined;
      if (from.location & 128) {
        const host = scene.cards.find((c) =>
          same(c, { ...from, location: from.location & 127 }),
        );
        const material = host?.overlay[event[8]];
        if (host && material) {
          host.overlay.splice(event[8], 1);
          moved = {
            ...host,
            code: material,
            overlay: [],
            counters: [],
            sceneId: `material:${next.step}:${i}`,
          };
        }
      } else {
        const index = scene.cards.findIndex((c) => same(c, from));
        if (index >= 0) {
          moved = scene.cards.splice(index, 1)[0];
          if (compact(from.location))
            for (const c of scene.cards)
              if (
                c.player === from.player &&
                c.location === from.location &&
                c.sequence > from.sequence
              )
                c.sequence--;
        }
      }
      if (to.location & 128) {
        const host = scene.cards.find((c) =>
          same(c, { ...to, location: to.location & 127 }),
        );
        if (host) host.overlay.splice(event[12], 0, code || moved?.code || 0);
      } else if (to.location) {
        if (compact(to.location))
          for (const c of scene.cards)
            if (
              c.player === to.player &&
              c.location === to.location &&
              c.sequence >= to.sequence
            )
              c.sequence++;
        scene.cards.push({
          ...moved,
          code: code || moved?.code || 0,
          type: moved?.type || 0,
          attack: moved?.attack || 0,
          defense: moved?.defense || 0,
          level: moved?.level || 0,
          rank: moved?.rank || 0,
          overlay: moved?.overlay || [],
          counters: moved?.counters || [],
          ...to,
          position: event[12],
          sceneId: moved?.sceneId || `move:${next.step}:${i}`,
        });
      }
      const arriving = scene.cards.find((c) => same(c, to));
      emit({
        kind: "move",
        code,
        from,
        to,
        arrivals: arriving ? [arriving.sceneId] : [],
        moving: arriving ? copy(arriving) : undefined,
      });
    } else if (kind === 53) {
      const from = spot(event, 5),
        c = scene.cards.find((c) => same(c, from));
      if (c) c.position = event[9];
      emit({ kind: "position", code: packed(event, 1), to: from });
    } else if ([54, 60, 62, 64].includes(kind)) {
      emit({
        kind:
          kind === 54
            ? "set"
            : kind === 60
            ? "summon"
            : kind === 62
            ? "special"
            : "flip",
        code: packed(event, 1),
        to: spot(event, 5),
      });
    } else if (kind === 90) {
      // Draws are already accompanied by MSG_MOVE in some cores, but the
      // locked core may only emit MSG_DRAW. Reconcile deck/hand from the query
      // at batch completion, rather than invent duplicate cards.
      const player = event[1],
        arrivals: string[] = [];
      const need = Math.max(
        0,
        next.cards.filter((c) => c.player === player && c.location === 2)
          .length -
          scene.cards.filter((c) => c.player === player && c.location === 2)
            .length,
      );
      for (let n = 0; n < Math.min(need, event[2]); n++) {
        const code = packed(event, 3 + 4 * n) & 0x7fffffff;
        const index = scene.cards.findIndex(
          (c) => c.player === player && c.location === 1 && c.code === code,
        );
        if (index < 0) continue;
        const c = scene.cards.splice(index, 1)[0];
        for (const other of scene.cards)
          if (
            other.player === player &&
            other.location === 1 &&
            other.sequence > c.sequence
          )
            other.sequence--;
        c.location = 2;
        c.sequence = scene.cards.filter(
          (c) => c.player === player && c.location === 2,
        ).length;
        c.position = 8;
        scene.cards.push(c);
        arrivals.push(c.sceneId);
      }
      emit({ kind: "draw", player, amount: event[2], arrivals });
    } else if (kind === 110) {
      const from = spot(event, 1),
        to = spot(event, 5);
      emit({
        kind: "attack",
        from,
        to: to.location
          ? to
          : { player: 1 - from.player, location: 0, sequence: 0 },
      });
    } else if (kind === 70) {
      const to = spot(event, 5),
        code = packed(event, 1),
        index = event[16];
      scene.chains = [...scene.chains, { ...to, code, index }];
      emit({ kind: "chain", code, to, amount: index });
    } else if ([72, 73, 74].includes(kind)) {
      if (kind === 74) scene.chains = [];
      emit({ kind: kind === 74 ? "chainEnd" : "resolve", amount: event[1] });
    } else if ([91, 92, 94, 100].includes(kind)) {
      const player = event[1],
        amount = packed(event, 2);
      scene.lp = [...scene.lp];
      scene.lp[player] =
        kind === 94
          ? amount
          : scene.lp[player] + (kind === 92 ? amount : -amount);
      emit({
        kind: kind === 92 ? "recover" : kind === 94 ? "lp" : "damage",
        player,
        amount,
      });
    } else if ([101, 102].includes(kind)) {
      const to = spot(event, 3),
        c = scene.cards.find((c) => same(c, to));
      const type = event[1] | (event[2] << 8),
        amount = event[6] | (event[7] << 8);
      if (c) {
        const old = c.counters.find((n) => (n & 65535) === type),
          count = Math.max(
            0,
            ((old || 0) >>> 16) + (kind === 101 ? amount : -amount),
          );
        c.counters = c.counters.filter((n) => (n & 65535) !== type);
        if (count) c.counters.push((count << 16) | type);
      }
      emit({ kind: "counter", to, amount });
    } else if (kind === 40) {
      scene.turnPlayer = event[1];
      scene.turn++;
      emit({ kind: "turn", player: event[1] });
    } else if (kind === 41) {
      scene.phase = event[1] | (event[2] << 8);
      emit({ kind: "phase" });
    }
  }
  const final = seedScene(next, scene);
  final.action = scene.action;
  final.chains = scene.chains;
  steps.push(final);
  return steps;
}

export function scenePoint(
  place: Spot,
  view: number,
): { x: number; y: number } {
  const near = place.player === view;
  if (place.location === 0) return { x: 500, y: near ? 890 : 30 };
  if (place.location === 4 || place.location === 8) {
    if (place.location === 8 && place.sequence >= 5)
      return { x: near ? 80 : 920, y: near ? 695 : 225 };
    return {
      x: 215 + (near ? place.sequence : 4 - place.sequence) * 142.5,
      y: place.location === 4 ? (near ? 535 : 385) : near ? 695 : 225,
    };
  }
  if (place.location === 2) return { x: 500, y: near ? 845 : 75 };
  const x = near
    ? place.location === 64 || place.location === 32
      ? 80
      : 920
    : place.location === 64 || place.location === 32
    ? 920
    : 80;
  const y =
    place.location === 64
      ? near
        ? 845
        : 75
      : [16, 32].includes(place.location)
      ? near
        ? 535
        : 385
      : near
      ? 695
      : 225;
  return { x, y };
}
