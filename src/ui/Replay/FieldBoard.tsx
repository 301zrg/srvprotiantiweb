import "./field.css";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
import { useMediaQuery } from "@/hook";
import type { ReplayCard } from "@/replay/messages";
import { settingStore } from "@/stores/settingStore";
import { BoardCard } from "@/ui/Shared/DuelBoard/BoardCard";
import {
  concealReplayCard,
  positionLabel,
  replayCardWords,
} from "@/ui/Shared/DuelBoard/cardState";
import type { SceneFrame, Spot } from "@/ui/Shared/DuelBoard/scene";
import {
  SceneBoard,
  type SceneBoardHandle,
} from "@/ui/Shared/DuelBoard/SceneBoard";
import { sceneInformationCards } from "@/ui/Shared/DuelBoard/sceneInformation";
import { replayFieldWords } from "@/ui/Shared/DuelBoard/sceneWords";
import { DuelPanel } from "@/ui/Shared/DuelPanel";

import { ReplayCardTile } from "./CardTile";

export { replayFieldWords };

const locations = [2, 4, 8, 1, 64, 16, 32];
/** Replays use the fixed 1103 profile (Master Rule 2) of the shared board. */
const REPLAY_MASTER_RULE = 2;

function centerField(el: HTMLDivElement | null | undefined) {
  if (!el) return;
  el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) / 2);
  el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
}
/** Replay board on the shared duel board. The duel layout shell sizes it;
 * zoom only scales the board inside its own scroll area. */
export function FieldBoard({
  frame,
  view,
  reveal,
  language,
  text,
  zoom,
  onInspect,
  onPause,
}: {
  frame: SceneFrame;
  view: number;
  reveal: boolean;
  language: string;
  text: string[];
  zoom: number;
  onInspect: (card: ReplayCard) => void;
  onPause: () => void;
}) {
  const t = replayFieldWords(language),
    cardWords = replayCardWords(language),
    board = useRef<SceneBoardHandle>(null);
  const { showZoneCounts } = useSnapshot(settingStore);
  const desktop = useMediaQuery("(min-width: 1024px) and (min-height: 600px)");
  const [pile, setPile] = useState<Spot>();
  useEffect(() => {
    // Keep a zoomed board centred; reset scrolls back to the full field.
    centerField(board.current?.element);
  }, [zoom]);
  const label = (location: number) =>
    text[16 + locations.indexOf(location)] || "";
  const action = frame.action;
  const focus = (c: Spot) =>
    action?.to &&
    c.player === action.to.player &&
    c.location === (action.to.location & 127) &&
    c.sequence === action.to.sequence;
  const cardName = (card: ReplayCard) =>
    concealReplayCard(card, reveal)
      ? cardWords.facedown
      : fetchCard(card.code).text.name || String(card.code);
  const motion = (
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) =>
    ({
      "--replay-from-x": `${from.x - to.x}px`,
      "--replay-from-y": `${from.y - to.y}px`,
    }) as CSSProperties;
  return (
    <section className="replay-field-board">
      <SceneBoard
        handle={board}
        className="replay-field-viewport"
        cards={frame.cards}
        chains={frame.chains}
        view={view}
        masterRule={REPLAY_MASTER_RULE}
        zoom={zoom}
        // Large desktop screens fill the available area, as before.
        maxScale={desktop ? Infinity : 1.2}
        information={sceneInformationCards(frame.cards, language, view, reveal)}
        showCounts={showZoneCounts}
        conceal={(card) => concealReplayCard(card, reveal)}
        names={{ slot: "replay-field-slot", pile: "replay-field-pile" }}
        pileProps={({ player, location }, cards) => ({
          role: "button",
          tabIndex: 0,
          "data-pile": location,
          "aria-label": `${frame.names[player]} · ${label(location)} ${
            cards.length
          }`,
          onClick: () => {
            onPause();
            setPile({ player, location, sequence: 0 });
          },
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onPause();
              setPile({ player, location, sequence: 0 });
            }
          },
        })}
        renderCard={({
          card,
          key,
          geometry,
          pose,
          hand,
          infoId,
          materialHost,
          point,
        }) => {
          const arriving =
            !materialHost && action?.arrivals?.includes(card.sceneId);
          const origin = !arriving
            ? undefined
            : action?.kind === "draw"
            ? { player: card.player, location: 1, sequence: 0 }
            : action?.from && ![2, 4, 8].includes(action.from.location)
            ? action.from
            : undefined;
          const status = card.status || 0;
          return (
            <BoardCard
              key={key}
              geometry={geometry}
              pose={pose}
              hand={hand}
              code={card.code}
              isBack={concealReplayCard(card, reveal)}
              disabled={!!(status & 1)}
              targeted={card.targeted}
              targetFlash={card.targetFlash}
              className={`replay-card replay-field-card ${
                focus(card) ? "replay-field-focus" : ""
              } ${origin ? "replay-field-enter" : ""}`}
              style={origin ? motion(point(origin), pose) : undefined}
              data-card-info-id={infoId}
              data-player={card.player}
              data-location={card.location}
              data-sequence={card.sequence}
              data-position={card.position}
              data-materials={card.overlay.length}
              aria-label={`${cardName(card)}，${label(
                card.location & 127,
              )}，${positionLabel(card, language)}`}
              onClick={() => onInspect(card)}
            >
              {!!(status & 1) && (
                <span className="replay-negated replay-field-status scene-board-upright">
                  {cardWords.disabled}
                </span>
              )}
              {!!(status & 0x4000000) && (
                <span className="replay-negated replay-field-status scene-board-upright">
                  {cardWords.forbidden}
                </span>
              )}
              {!materialHost && !!card.overlay.length && (
                <span className="replay-field-materials scene-board-upright">
                  {card.overlay.length}
                </span>
              )}
            </BoardCard>
          );
        }}
        overlay={({ geometry, point, pose }) => {
          const moving = action?.moving;
          return (
            <>
              {moving &&
                action.from &&
                action.to &&
                [2, 4, 8].includes(action.from.location) &&
                [1, 16, 32, 64].includes(action.to.location) && (
                  <BoardCard
                    key={`depart:${frame.step}:${moving.sceneId}`}
                    geometry={geometry}
                    pose={{ ...pose({ ...moving, ...action.to }), zIndex: 30 }}
                    hand={false}
                    code={moving.code}
                    isBack={concealReplayCard(moving, reveal)}
                    className="replay-field-card replay-field-enter replay-field-leave"
                    style={motion(point(action.from), point(action.to))}
                    tabIndex={-1}
                    aria-hidden
                  />
                )}
              {action?.kind === "attack" && action.from && action.to && (
                <svg
                  className="replay-field-arrows scene-board-overlay"
                  aria-label={t.attack}
                >
                  <defs>
                    <marker
                      id="replay-attack-tip"
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="8"
                      markerHeight="8"
                      orient="auto"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffca57" />
                    </marker>
                  </defs>
                  <line
                    x1={point(action.from).x}
                    y1={point(action.from).y}
                    x2={point(action.to).x}
                    y2={point(action.to).y}
                    stroke="#ffca57"
                    strokeWidth="9"
                    markerEnd="url(#replay-attack-tip)"
                  />
                </svg>
              )}
            </>
          );
        }}
      />
      <DuelPanel
        open={!!pile}
        onClose={() => setPile(undefined)}
        title={
          pile ? `${frame.names[pile.player]} · ${label(pile.location)}` : ""
        }
        testId="replay-pile-panel"
        compact
        desktopWidth="220px"
      >
        <div className="replay-field-pile-list">
          {pile &&
            frame.cards
              .filter(
                (c) => c.player === pile.player && c.location === pile.location,
              )
              .map((c) => (
                <ReplayCardTile
                  key={c.sceneId}
                  card={c}
                  reveal={reveal}
                  language={language}
                  zoneLabel={label(c.location)}
                  onInspect={(card) => {
                    setPile(undefined);
                    onInspect(card);
                  }}
                />
              ))}
        </div>
      </DuelPanel>
    </section>
  );
}
