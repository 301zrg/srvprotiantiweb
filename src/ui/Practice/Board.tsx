import { Button, Dropdown, Modal } from "antd";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";

import { fetchCard, fetchStrings, getStrings, Region } from "@/api";
import { choicesAtCard } from "@/practice/interactions";
import type { PracticeChoice, PracticeRequest } from "@/practice/prompts";
import type { ReplayCard } from "@/replay/messages";
import { settingStore } from "@/stores/settingStore";
import { YgoCard } from "@/ui/Shared";
import { mobileMessages } from "@/variant/mobileMessages";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import bgStyles from "../Duel/PlayMat/Bg/index.module.scss";
import { matConfig, updateMatLayout } from "../Duel/PlayMat/css";
import { positionLabel } from "../Replay/cardState";
import { replayFieldWords } from "../Replay/FieldBoard";
import type { SceneFrame } from "../Replay/scene";

export const practiceZoneName = (zone: number) =>
  fetchStrings(
    Region.System,
    (
      {
        1: 1000,
        2: 1001,
        4: 1002,
        8: 1003,
        16: 1004,
        32: 1005,
        64: 1006,
      } as Record<number, number>
    )[zone] || 1007,
  );
const selecting = new Set([
  "cards",
  "tribute",
  "sum",
  "unselect",
  "sort",
  "place",
]);

/** Uses the live board's responsive dimensions, with a fixed A-bottom view. */
function point(
  card: Pick<ReplayCard, "player" | "location" | "sequence" | "position">,
  geometry: typeof matConfig,
  handCount: number,
) {
  const g = geometry;
  const side = card.player === 0 ? 1 : -1;
  let x = 0,
    y = 0,
    height = g.BLOCK_HEIGHT_M,
    rotation = card.player * 180;
  if (card.location === 2) {
    const angle =
      (card.sequence - (handCount - 1) / 2) *
      2 *
      Math.atan(
        (g.CARD_RATIO * g.HAND_CARD_HEIGHT) /
          2 /
          (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT),
      ) *
      0.9;
    x =
      Math.sin(angle) *
      (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT / 2);
    y =
      g.BLOCK_HEIGHT_M +
      g.BLOCK_HEIGHT_S +
      2 * g.ROW_GAP +
      g.HAND_MARGIN_TOP +
      g.HAND_CARD_HEIGHT +
      g.HAND_CIRCLE_CENTER_OFFSET_Y -
      (Math.cos(angle) *
        (g.HAND_CIRCLE_CENTER_OFFSET_Y + g.HAND_CARD_HEIGHT / 2) +
        g.HAND_CARD_HEIGHT / 2) +
      g.HAND_MAT_OFFSET_Y;
    height = g.HAND_CARD_HEIGHT;
    rotation += (angle * 180) / Math.PI;
  } else if (card.location === 1 || card.location === 64) {
    x =
      (g.DECK_OFFSET_X + 2 * (g.BLOCK_WIDTH + g.COL_GAP)) *
      (card.location === 1 ? 1 : -1);
    y = g.DECK_ROW_Y;
    height = g.DECK_CARD_HEIGHT;
    rotation += card.location === 1 ? -g.DECK_ROTATE_Z : g.DECK_ROTATE_Z;
  } else if (card.location === 4) {
    x = (card.sequence - 2) * (g.BLOCK_WIDTH + g.COL_GAP);
    y = g.MONSTER_ROW_Y;
  } else {
    const outside =
      g.BLOCK_WIDTH * 2.5 +
      g.COL_GAP * 2 +
      g.BLOCK_OUTSIDE_OFFSET_X +
      (g.CARD_HEIGHT_O * g.CARD_RATIO) / 2;
    x =
      card.location === 8 && card.sequence < 5
        ? (card.sequence - 2) * (g.BLOCK_WIDTH + g.COL_GAP)
        : outside;
    y = g.SPELL_ROW_Y;
    height =
      card.location === 8 && card.sequence < 5
        ? g.BLOCK_HEIGHT_S
        : g.CARD_HEIGHT_O;
    if (card.location === 8 && card.sequence === 5) x = -outside;
    if (card.location === 32) y -= g.ROW_GAP + g.CARD_HEIGHT_O;
  }
  if (card.location === 4 && card.position & 12) {
    rotation += 90;
    height = g.BLOCK_WIDTH;
  }
  return { x: x * side, y: y * side, height, rotation };
}

export const PracticeBoard = ({
  frame,
  request,
  language,
  disabled,
  selected,
  onToggle,
  onChoose,
  onInspect,
}: {
  frame: SceneFrame;
  request?: PracticeRequest;
  language: string;
  disabled: boolean;
  selected: number[];
  onToggle: (choice: PracticeChoice) => void;
  onChoose: (choice: PracticeChoice, label?: string) => void;
  onInspect: (card: ReplayCard) => void;
}) => {
  const host = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    width: 1,
    height: 1,
    geometry: { ...matConfig },
  });
  const [pile, setPile] = useState<{ player: number; location: number }>();
  const { showZoneCounts } = useSnapshot(settingStore);
  const words = previewMessages(language);
  const actions = replayFieldWords(language);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => {
      updateMatLayout(
        window.matchMedia("(orientation: landscape) and (min-width: 480px)")
          .matches,
        practiceProfile.rules,
      );
      setLayout({
        width: element.clientWidth,
        height: element.clientHeight,
        geometry: { ...matConfig },
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const g = layout.geometry;
  const scale = Math.min(
    layout.width / g.BOARD_WIDTH,
    layout.height / g.BOARD_HEIGHT,
    1.2,
  );
  const addressChoices = (
    card: Pick<ReplayCard, "player" | "location" | "sequence">,
  ) => choicesAtCard(disabled ? undefined : request, card);
  const commandLabel = (choice: PracticeChoice) => {
    const ids =
      request?.kind === "idle"
        ? [1151, 1152, 0, 1153, 1159, 1150]
        : request?.kind === "battle"
        ? [1150, 1157]
        : [1150];
    const action =
      request?.kind === "idle" && choice.action === 2
        ? actions.position
        : fetchStrings(Region.System, ids[choice.action ?? 0] || 1150);
    return [action, choice.description ? getStrings(choice.description) : ""]
      .filter(Boolean)
      .join(" · ");
  };
  const cardButton = (card: ReplayCard, key: string, positioned = false) => {
    const choices = addressChoices(card);
    const pick =
      request && selecting.has(request.kind) ? choices[0] : undefined;
    const legalCommands =
      request && ["idle", "battle", "chain"].includes(request.kind)
        ? choices
        : [];
    const name = fetchCard(card.code).text.name || String(card.code);
    const p = point(
      card,
      g,
      frame.cards.filter((c) => c.player === card.player && c.location === 2)
        .length,
    );
    const style: CSSProperties | undefined = positioned
      ? {
          left: `calc(50% + ${p.x}px)`,
          top: `calc(50% + ${p.y}px)`,
          height: p.height,
          width: p.height * g.CARD_RATIO,
          transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
          zIndex: card.location === 2 ? card.sequence + 20 : 4,
        }
      : undefined;
    const items = [
      ...legalCommands.map((choice, i) => ({
        key: `action-${i}`,
        label: (
          <span
            data-testid="practice-card-action"
            data-action={choice.action}
            data-player={request?.player}
          >
            {commandLabel(choice)}
          </span>
        ),
        onClick: () => {
          setPile(undefined);
          onChoose(choice, `${name} · ${commandLabel(choice)}`);
        },
      })),
      { key: "details", label: words.details, onClick: () => onInspect(card) },
    ];
    return (
      <Dropdown
        key={key}
        trigger={["click"]}
        menu={{ items }}
        open={pick ? false : undefined}
      >
        <button
          className={`practice-field-card ${
            positioned ? "practice-positioned-card" : ""
          }`}
          style={style}
          data-testid="practice-card"
          data-player={card.player}
          data-location={card.location}
          data-sequence={card.sequence}
          data-actionable={!!choices.length}
          data-selected={!!pick && selected.includes(pick.index)}
          data-facedown={!!(card.position & 10)}
          title={`${name} · ${positionLabel(card, language)}`}
          aria-label={name}
          aria-pressed={pick ? selected.includes(pick.index) : undefined}
          onClick={() => {
            if (pick) onToggle(pick);
          }}
        >
          <YgoCard code={card.code} width="100%" />
          {(card.location === 4 || card.location === 8) &&
            !!(card.type & 1) && (
              <span className="practice-card-power">
                {card.attack}/{card.defense}
              </span>
            )}
        </button>
      </Dropdown>
    );
  };
  const pileCards =
    pile &&
    frame.cards.filter(
      (c) => c.player === pile.player && c.location === pile.location,
    );
  const visiblePileCards =
    pile?.location === 1
      ? (pileCards || []).filter((card) => addressChoices(card).length)
      : pileCards || [];
  return (
    <div
      className="practice-mat-viewport"
      ref={host}
      data-testid="practice-board"
      data-fixed-view="0"
    >
      <div className="practice-life-bars">
        {[0, 1].map((player) => (
          <span key={player} data-turn={frame.turnPlayer === player}>
            {frame.names[player]} · {frame.lp[player]} LP
          </span>
        ))}
      </div>
      <div
        className="practice-board-plane"
        style={{
          width: g.BOARD_WIDTH,
          height: g.BOARD_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {[0, 1].flatMap((player) =>
          [4, 8].flatMap((location) =>
            Array.from({ length: location === 4 ? 5 : 6 }, (_, sequence) => {
              const address = { player, location, sequence, position: 1 };
              const p = point(address, g, 0);
              const choice =
                request?.kind === "place"
                  ? addressChoices(address)[0]
                  : undefined;
              const height =
                location === 4
                  ? g.BLOCK_HEIGHT_M
                  : sequence === 5
                  ? g.CARD_HEIGHT_O
                  : g.BLOCK_HEIGHT_S;
              return (
                <button
                  key={`${player}:${location}:${sequence}`}
                  className={`${bgStyles.block} practice-field-slot`}
                  data-testid="practice-slot"
                  data-player={player}
                  data-location={location}
                  data-sequence={sequence}
                  data-selectable={!!choice}
                  data-selected={!!choice && selected.includes(choice.index)}
                  disabled={!choice}
                  aria-label={`${player === 0 ? "A" : "B"} ${practiceZoneName(
                    location,
                  )} ${sequence + 1}`}
                  style={{
                    left: `calc(50% + ${p.x}px)`,
                    top: `calc(50% + ${p.y}px)`,
                    width:
                      sequence === 5 ? height * g.CARD_RATIO : g.BLOCK_WIDTH,
                    height,
                  }}
                  onClick={() => {
                    if (choice) onToggle(choice);
                  }}
                />
              );
            }),
          ),
        )}
        {[0, 1].flatMap((player) =>
          [1, 64, 16, 32].map((location) => {
            const cards = frame.cards.filter(
              (c) => c.player === player && c.location === location,
            );
            const p = point(
              { player, location, sequence: 0, position: 1 },
              g,
              0,
            );
            return (
              <button
                className="practice-field-pile"
                key={`${player}:${location}`}
                data-testid="practice-pile"
                data-player={player}
                data-location={location}
                style={{
                  left: `calc(50% + ${p.x}px)`,
                  top: `calc(50% + ${p.y}px)`,
                  height: p.height,
                  width: p.height * g.CARD_RATIO,
                }}
                aria-label={`${practiceZoneName(location)} (${cards.length})`}
                onClick={() => setPile({ player, location })}
              >
                {!!cards.length && (
                  <YgoCard
                    code={cards.at(-1)?.code}
                    isBack={location === 1}
                    width="100%"
                  />
                )}
                <span className="practice-pile-label">
                  {practiceZoneName(location)}
                </span>
                {showZoneCounts && (
                  <span className="practice-pile-count">{cards.length}</span>
                )}
              </button>
            );
          }),
        )}
        {frame.cards
          .filter((card) => [2, 4, 8].includes(card.location))
          .map((card) => cardButton(card, card.sceneId, true))}
      </div>
      <Modal
        open={!!pile}
        onCancel={() => setPile(undefined)}
        footer={
          <Button onClick={() => setPile(undefined)}>
            {mobileMessages(language).close}
          </Button>
        }
        title={
          pile
            ? `${pile.player === 0 ? "A" : "B"} · ${practiceZoneName(
                pile.location,
              )} (${pileCards?.length || 0})`
            : ""
        }
        width={640}
        centered
      >
        <div className="practice-pile-cards">
          {visiblePileCards.map((card, i) => cardButton(card, String(i)))}
          {!visiblePileCards.length && (
            <p>
              {pileCards?.length
                ? previewFormat(words.remaining, { count: pileCards.length })
                : words.emptyZone}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};
