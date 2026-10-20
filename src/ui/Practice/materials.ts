import type { SceneCard, SceneFrame, Spot } from "../Replay/scene";

export interface PracticeMaterial {
  card: SceneCard;
  host: Spot;
  index: number;
  atOrigin: boolean;
}
export type PracticeSceneFrame = SceneFrame & {
  materials?: PracticeMaterial[];
};
const same = (a: Spot, b: Spot) =>
  a.player === b.player &&
  a.location === b.location &&
  a.sequence === b.sequence;
const spot = (event: number[], p: number): Spot => ({
  player: event[p],
  location: event[p + 1] & 127,
  sequence: event[p + 2],
});

/** Presentation only: Core can attach to an Extra host before asking its slot. */
export function practiceMaterialFrames(
  previous: PracticeSceneFrame | undefined,
  scene: SceneFrame,
  events: number[][],
) {
  const materials = (previous?.materials ?? []).map((m) => ({
    ...m,
    host: { ...m.host },
  }));
  const cards = (previous?.cards ?? []).map((c) => ({ ...c }));
  const arriving: Spot[] = [];
  for (const event of events) {
    if (event[0] !== 50) continue;
    const from = spot(event, 5),
      to = spot(event, 9);
    const fromOverlay = !!(event[6] & 128),
      toOverlay = !!(event[10] & 128);
    let card: SceneCard | undefined;
    if (fromOverlay) {
      const i = materials.findIndex(
        (m) => same(m.host, from) && m.index === event[8],
      );
      if (i >= 0) card = materials.splice(i, 1)[0].card;
      for (const m of materials)
        if (same(m.host, from) && m.index > event[8]) m.index--;
    } else {
      const i = cards.findIndex((c) => same(c, from));
      if (i >= 0) card = cards.splice(i, 1)[0];
      if ([1, 2, 16, 32, 64].includes(from.location))
        for (const c of cards)
          if (
            c.player === from.player &&
            c.location === from.location &&
            c.sequence > from.sequence
          )
            c.sequence--;
    }
    if (toOverlay && card)
      materials.push({
        card,
        host: to,
        index: event[12],
        atOrigin: to.location === 64,
      });
    if (!fromOverlay) {
      for (const m of materials) if (same(m.host, from)) m.host = { ...to };
      if (from.location === 64 && to.location === 4 && !toOverlay)
        arriving.push(to);
    }
    if (!toOverlay && to.location && card)
      cards.push({ ...card, ...to, position: event[12] });
  }
  const valid = materials.filter((m) =>
    scene.cards.some(
      (c) => same(c, m.host) && c.overlay[m.index] === m.card.code,
    ),
  );
  const collecting = valid
    .filter((m) => m.atOrigin && arriving.some((to) => same(to, m.host)))
    .sort((a, b) => a.index - b.index);
  const snapshots: PracticeSceneFrame[] = [];
  if (collecting.length) {
    const withoutHost = scene.cards.filter(
      (c) => !arriving.some((to) => same(c, to)),
    );
    const snapshot = () => ({
      ...scene,
      cards: withoutHost,
      materials: valid.map((m) => ({ ...m })),
    });
    snapshots.push(snapshot());
    for (const m of collecting) {
      m.atOrigin = false;
      snapshots.push(snapshot());
    }
  }
  const final = { ...scene, materials: valid };
  return {
    scene: final,
    animation: snapshots.length ? [...snapshots, final] : [],
  };
}
