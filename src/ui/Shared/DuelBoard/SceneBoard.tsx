import "./sceneBoard.css";

import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { roomyStatsQuery } from "@/variant/cardStats";

import { CardInformationLayer, type InformationCard } from "../CardInformation";
import { BgChain } from "../Chain";
import { YgoCard } from "../YgoCard";
import {
  type BoardGeometry,
  boardGeometry,
  boardScale,
  type CardPose,
  cardPose,
  geometryCssVars,
  wideBoardQuery,
  zoneRect,
} from "./geometry";
import { type SceneCard, sceneSpot, type Spot } from "./scene";
import { ZoneBlock, ZoneCount, ZoneLayer } from "./ZoneBlock";

const pileLocations = [1, 64, 16, 32];

/** Material under a host, staged at its origin while Core collects it. */
export interface SceneMaterial {
  card: SceneCard;
  host: Spot;
  index: number;
  atOrigin: boolean;
}

/** A material rendered as its own card: host address + overlay index. */
export type SceneMaterialCard = SceneCard & { overlayIndex: number };

export const materialCard = (
  host: SceneCard,
  index: number,
  sceneId = `${host.sceneId}:material:${index}`,
): SceneMaterialCard => ({
  ...host,
  sceneId,
  targeted: false,
  code: host.overlay[index],
  location: host.location | 128,
  overlayIndex: index,
  overlay: [],
  counters: [],
  equipLocation: null,
  targetLocations: [],
  position: 1,
  type: 0,
});

export interface SceneCardRender {
  card: SceneCard | SceneMaterialCard;
  key: string;
  geometry: BoardGeometry;
  pose: CardPose;
  hand: boolean;
  /** Fan host when this is a material. */
  materialHost?: SceneCard;
  /** Shown at its origin while being collected; not interactive. */
  staged: boolean;
  /** Set on field cards that carry annotations (stats, links, counters). */
  infoId?: string;
  /** Board-center coordinates of any zone, e.g. an animation origin. */
  point: (spot: Spot) => { x: number; y: number };
}

type ZoneProps = Omit<Parameters<typeof ZoneBlock>[0], "rect">;

export interface SceneBoardHelpers {
  geometry: BoardGeometry;
  /** Board-center coordinates of a zone. */
  point: (spot: Spot) => { x: number; y: number };
  pose: (card: SceneCard) => CardPose;
}

export interface SceneBoardHandle {
  element: HTMLDivElement | null;
}

/** One flat duel board for offline modes. Geometry, zones, piles, material
 * fans and chain markers are shared; modes supply the card element and the
 * interaction props, never their own coordinates. */
export function SceneBoard({
  cards,
  materials,
  chains = [],
  view,
  masterRule,
  zoom = 1,
  maxScale = 1.2,
  information,
  showCounts,
  conceal = () => false,
  names,
  renderCard,
  slotProps,
  pileProps,
  overlay,
  handle,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  cards: readonly SceneCard[];
  materials?: readonly SceneMaterial[];
  chains?: readonly (Spot & { index: number })[];
  view: number;
  masterRule: number;
  zoom?: number;
  /** Fit limit before zoom; the online board uses 1.2. */
  maxScale?: number;
  information: InformationCard[];
  showCounts: boolean;
  /** Whether a card's face is hidden (replay without reveal). */
  conceal?: (card: SceneCard) => boolean;
  /** Mode class names kept for styling and tests. */
  names: { slot: string; pile: string };
  renderCard: (props: SceneCardRender) => ReactNode;
  slotProps?: (spot: Spot) => ZoneProps | undefined;
  pileProps?: (spot: Spot, cards: SceneCard[]) => ZoneProps;
  overlay?: (helpers: SceneBoardHelpers) => ReactNode;
  handle?: Ref<SceneBoardHandle>;
  [data: `data-${string}`]: unknown;
}) {
  const host = useRef<HTMLDivElement>(null);
  useImperativeHandle(handle, () => ({ element: host.current }), []);
  const [layout, setLayout] = useState(() => ({
    width: 1,
    height: 1,
    geometry: boardGeometry({ wide: false, masterRule, roomy: false }),
  }));
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () =>
      setLayout({
        width: element.clientWidth,
        height: element.clientHeight,
        // Same responsive rules as the online board, held per board: offline
        // boards never write the online board's live geometry.
        geometry: boardGeometry({
          wide: window.matchMedia(wideBoardQuery).matches,
          masterRule,
          roomy: window.matchMedia(roomyStatsQuery).matches,
        }),
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [masterRule]);
  const g = layout.geometry;
  const scale = boardScale(g, layout.width, layout.height, maxScale) * zoom;
  const handCount = (player: number) =>
    cards.filter((c) => c.player === player && c.location === 2).length;
  const pose = (card: SceneCard) =>
    cardPose(g, {
      spot: sceneSpot(card, view),
      handCount: handCount(card.player),
      defense: card.location === 4 && !!(card.position & 12),
      faceDown: !!(card.position & 10),
    });
  const point = (spot: Spot) => {
    const rect = zoneRect(g, sceneSpot(spot, view));
    return { x: rect.x, y: rect.y };
  };
  const same = (a: Spot, b: Spot) =>
    a.player === b.player &&
    a.location === b.location &&
    a.sequence === b.sequence;
  const chainsAt = (spot: Spot) =>
    chains
      .filter((chain) => same(chain, spot))
      .map((chain) => ({ index: chain.index }));

  const emit = (
    card: SceneCard | SceneMaterialCard,
    key: string,
    materialHost?: SceneCard,
    staged = false,
  ) => {
    const p = materialHost
      ? cardPose(g, {
          spot: sceneSpot(materialHost, view),
          overlay: {
            index: (card as SceneMaterialCard).overlayIndex,
            count: materialHost.overlay.length,
          },
        })
      : pose(card);
    return renderCard({
      card,
      key,
      geometry: g,
      pose: p,
      hand: !materialHost && card.location === 2,
      materialHost,
      staged,
      point,
      infoId:
        !materialHost && !staged && [4, 8].includes(card.location)
          ? key
          : undefined,
    });
  };
  const staging = (host: Spot, index: number) =>
    materials?.find((m) => same(m.host, host) && m.index === index);
  const rendered = cards
    .filter((card) => [2, 4, 8].includes(card.location))
    .flatMap((card) => [
      ...card.overlay.map((_, i) => {
        const m = staging(card, i);
        return m?.atOrigin
          ? emit(m.card, m.card.sceneId, undefined, true)
          : emit(
              materialCard(card, i, m?.card.sceneId),
              m?.card.sceneId ?? `${card.sceneId}:material:${i}`,
              card,
            );
      }),
      emit(card, card.sceneId),
    ]);
  // Core may attach materials to a host before announcing the host's slot.
  for (const m of materials ?? []) {
    if (cards.some((c) => [2, 4, 8].includes(c.location) && same(c, m.host)))
      continue;
    const hostCard: SceneCard = {
      ...m.card,
      ...m.host,
      position: 1,
      overlay: (materials ?? [])
        .filter((o) => same(o.host, m.host))
        .sort((a, b) => a.index - b.index)
        .map((o) => o.card.code),
    };
    rendered.push(
      m.atOrigin
        ? emit(m.card, m.card.sceneId, undefined, true)
        : emit(
            materialCard(hostCard, m.index, m.card.sceneId),
            m.card.sceneId,
            hostCard,
          ),
    );
  }
  const handChains = chains.filter((chain) => chain.location === 2);

  return (
    <div
      {...rest}
      ref={host}
      className={`scene-board ${rest.className ?? ""}`}
      data-scroll={zoom > 1}
    >
      <CardInformationLayer root={host} cards={information} />
      <div
        className="scene-board-canvas"
        style={{ width: g.BOARD_WIDTH * scale, height: g.BOARD_HEIGHT * scale }}
      >
        <div
          className="scene-board-plane"
          style={
            {
              ...geometryCssVars(g),
              "--scene-board-scale": scale,
              width: g.BOARD_WIDTH,
              height: g.BOARD_HEIGHT,
              transform: `scale(${scale})`,
            } as CSSProperties
          }
        >
          <ZoneLayer>
            {[0, 1].flatMap((player) =>
              [4, 8].flatMap((location) =>
                Array.from(
                  { length: location === 4 ? 5 : 6 },
                  (_, sequence) => {
                    const spot = { player, location, sequence };
                    const near = player === view;
                    const props = slotProps?.(spot);
                    const markers = chainsAt(spot);
                    return (
                      <ZoneBlock
                        key={`${player}:${location}:${sequence}`}
                        {...props}
                        className={`scene-board-slot ${names.slot} ${
                          props?.className ?? ""
                        }`}
                        rect={zoneRect(g, sceneSpot(spot, view))}
                        data-player={player}
                        data-location={location}
                        data-sequence={sequence}
                      >
                        {!!markers.length && (
                          <BgChain chains={markers} op={!near} />
                        )}
                      </ZoneBlock>
                    );
                  },
                ),
              ),
            )}
            {[0, 1].flatMap((player) =>
              pileLocations.map((location) => {
                const spot = { player, location, sequence: 0 };
                const near = player === view;
                const rect = zoneRect(g, sceneSpot(spot, view));
                const pileCards = cards.filter(
                  (c) => c.player === player && c.location === location,
                );
                const top = pileCards.at(-1);
                const props = pileProps?.(spot, pileCards);
                const markers = chains
                  .filter(
                    (chain) =>
                      chain.player === player && chain.location === location,
                  )
                  .map((chain) => ({ index: chain.index }));
                return (
                  <ZoneBlock
                    key={`${player}:${location}`}
                    {...props}
                    className={`scene-board-pile ${names.pile} ${
                      props?.className ?? ""
                    }`}
                    rect={rect}
                    data-player={player}
                    data-location={location}
                  >
                    {top && (
                      <BoardPileTop
                        code={top.code}
                        isBack={location === 1 || conceal(top)}
                      />
                    )}
                    {showCounts && (
                      <ZoneCount
                        count={pileCards.length}
                        rect={rect}
                        depth={4}
                      />
                    )}
                    {!!markers.length && (
                      <BgChain
                        chains={markers}
                        op={!near}
                        nBelow={pileCards.length}
                      />
                    )}
                  </ZoneBlock>
                );
              }),
            )}
            {handChains.map((chain) => {
              const rect = zoneRect(g, sceneSpot(chain, view));
              return (
                <div
                  key={`hand-chain:${chain.index}`}
                  className="scene-board-overlay"
                  style={{ left: rect.x, top: rect.y, zIndex: 40 }}
                >
                  <div
                    style={{
                      position: "absolute",
                      width: rect.width,
                      height: rect.height,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    <BgChain chains={[{ index: chain.index }]} />
                  </div>
                </div>
              );
            })}
            {rendered}
            {overlay?.({ geometry: g, point, pose })}
          </ZoneLayer>
        </div>
      </div>
    </div>
  );
}

const BoardPileTop = ({ code, isBack }: { code: number; isBack: boolean }) => (
  <div className="scene-board-pile-top">
    <YgoCardFace code={code} isBack={isBack} />
  </div>
);

const YgoCardFace = ({ code, isBack }: { code: number; isBack: boolean }) => (
  <YgoCard
    className="scene-board-face"
    code={code}
    isBack={isBack}
    style={{ left: 0, top: 0, width: "100%", height: "100%" }}
  />
);
