import "./field.css";

import { Button, Drawer } from "antd";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { fetchCard } from "@/api";
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
export function FieldBoard({
  frame,
  view,
  reveal,
  language,
  text,
  onInspect,
  onPause,
}: {
  frame: SceneFrame;
  view: number;
  reveal: boolean;
  language: string;
  text: string[];
  onInspect: (card: ReplayCard) => void;
  onPause: () => void;
}) {
  const t = replayFieldWords(language),
    cardWords = replayCardWords(language),
    board = useRef<SceneBoardHandle>(null),
    heading = useRef<HTMLDivElement>(null),
    footer = useRef<HTMLDivElement>(null);
  const { showZoneCounts } = useSnapshot(settingStore);
  const [height, setHeight] = useState(540),
    [desktop, setDesktop] = useState(false),
    [zoom, setZoom] = useState(1),
    [pile, setPile] = useState<Spot>();
  // The page shell decides how much height the board may use; the shared
  // board fits itself inside it, and zoom scrolls beyond it.
  useEffect(() => {
    const el = board.current?.element;
    if (!el) return;
    const update = () => {
      const wide = window.innerWidth >= 1024 && window.innerHeight >= 600;
      setDesktop(wide);
      const player = el.closest(".replay-player");
      const top = el.getBoundingClientRect().top + (player?.scrollTop || 0);
      const bottom = Math.min(
        window.innerHeight,
        player?.getBoundingClientRect().bottom ?? window.innerHeight,
      );
      const footerHeight = footer.current?.getBoundingClientRect().height ?? 36;
      const bottomPadding = player
        ? parseFloat(getComputedStyle(player).paddingBottom) || 0
        : 0;
      setHeight(
        wide
          ? Math.max(1, bottom - top - footerHeight - bottomPadding - 2)
          : Math.max(320, window.innerHeight - 380),
      );
    };
    const observer = new ResizeObserver(update);
    el
      .closest(".replay-player")
      ?.querySelectorAll(".replay-header, .replay-controls, .replay-progress")
      .forEach((part) => observer.observe(part));
    if (heading.current) observer.observe(heading.current);
    if (footer.current) observer.observe(footer.current);
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [language, reveal]);
  useEffect(() => {
    if (desktop) centerField(board.current?.element);
  }, [desktop, height, zoom]);
  const label = (location: number) =>
    text[16 + locations.indexOf(location)] || "";
  const action = frame.action;
  const actionName = action
    ? t[action.kind as keyof typeof t] || action.kind
    : "";
  const actionCode = action?.code
    ? fetchCard(action.code).text.name || action.code
    : "";
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
    <section
      className={`replay-field-board ${desktop ? "replay-field-desktop" : ""}`}
    >
      <div className="replay-field-heading" ref={heading}>
        <div className="replay-field-toolbar">
          <div className="replay-field-tools">
            <Button onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 0.5))}>
              {t.zoom} {zoom}×
            </Button>
            <Button
              onClick={() => {
                setZoom(1);
                if (desktop) centerField(board.current?.element);
              }}
            >
              {t.reset}
            </Button>
          </div>
          <div
            className="replay-field-action"
            role="status"
            data-action={action?.kind || "ready"}
          >
            {actionName || t.ready} {actionCode}{" "}
            {action?.amount !== undefined ? `· ${action.amount}` : ""}
          </div>
        </div>
        <div className="replay-field-player">
          <strong>{frame.names[1 - view]}</strong>
          <span>
            {desktop &&
              `${label(2)} ${
                frame.cards.filter(
                  (c) => c.player === 1 - view && c.location === 2,
                ).length
              } · `}
            LP {frame.lp[1 - view]}
          </span>
        </div>
      </div>
      <SceneBoard
        handle={board}
        className="replay-field-viewport"
        style={{ height }}
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
      <div className="replay-field-player" ref={footer}>
        <strong>{frame.names[view]}</strong>
        <span>
          {desktop &&
            `${label(2)} ${
              frame.cards.filter((c) => c.player === view && c.location === 2)
                .length
            } · `}
          LP {frame.lp[view]}
        </span>
      </div>
      <Drawer
        rootClassName="replay-drawer"
        title={
          pile ? `${frame.names[pile.player]} · ${label(pile.location)}` : ""
        }
        open={!!pile}
        onClose={() => setPile(undefined)}
        width={450}
      >
        <Button onClick={() => setPile(undefined)}>{t.close}</Button>
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
      </Drawer>
    </section>
  );
}
