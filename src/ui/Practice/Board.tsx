import { Button, Dropdown, Modal } from "antd";
import { useState } from "react";
import { useSnapshot } from "valtio";

import { fetchCard, fetchStrings, getStrings, Region } from "@/api";
import { useMediaQuery, useMobileInterface } from "@/hook";
import { choicesAtCard } from "@/practice/interactions";
import type { PracticeChoice, PracticeRequest } from "@/practice/prompts";
import type { ReplayCard } from "@/replay/messages";
import { settingStore } from "@/stores/settingStore";
import { YgoCard } from "@/ui/Shared";
import { counterDescription } from "@/ui/Shared/CardInformation";
import { BoardCard } from "@/ui/Shared/DuelBoard/BoardCard";
import {
  positionLabel,
  replayCardWords,
} from "@/ui/Shared/DuelBoard/cardState";
import {
  materialCard,
  SceneBoard,
  type SceneCardRender,
} from "@/ui/Shared/DuelBoard/SceneBoard";
import { sceneInformationCards } from "@/ui/Shared/DuelBoard/sceneInformation";
import { replayFieldWords } from "@/ui/Shared/DuelBoard/sceneWords";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import {
  fieldPosition,
  fieldPositionLabel,
  type FieldSpot,
} from "@/variant/fieldSelection";
import { mobileMessages } from "@/variant/mobileMessages";
import { practiceProfile } from "@/variant/practice";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import type { PracticeSceneFrame } from "./materials";

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

/** Fixed A-bottom view on the shared duel board; both players are visible. */
export const PracticeBoard = ({
  frame,
  request,
  language,
  disabled,
  selected,
  located,
  onToggle,
  onChoose,
  onInspect,
}: {
  frame: PracticeSceneFrame;
  request?: PracticeRequest;
  language: string;
  disabled: boolean;
  selected: number[];
  located?: FieldSpot;
  onToggle: (choice: PracticeChoice) => void;
  onChoose: (choice: PracticeChoice, label?: string) => void;
  onInspect: (card: ReplayCard) => void;
}) => {
  const [pile, setPile] = useState<{
    player: number;
    location: number;
    sequence?: number;
  }>();
  const { showZoneCounts } = useSnapshot(settingStore);
  const portrait = useMediaQuery("(orientation: portrait)");
  const mobile = useMobileInterface();
  const actionFirst = portrait && mobile;
  const words = previewMessages(language);
  const actions = replayFieldWords(language);
  const cardWords = replayCardWords(language);
  const addressChoices = (
    card: Pick<ReplayCard, "player" | "location" | "sequence">,
  ) => choicesAtCard(disabled ? undefined : request, card);
  const commandLabel = (choice: PracticeChoice) => {
    const ids =
      request?.kind === "idle"
        ? [1151, 1152, 0, 1153, 1153, 1150]
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
  /** A practice card: on the board when `placed` is given, else in a list. */
  const cardButton = (
    card: ReplayCard & {
      overlayIndex?: number;
      targeted?: boolean;
      targetFlash?: number;
    },
    key: string,
    placed?: SceneCardRender,
  ) => {
    const choices = addressChoices(card);
    const pick =
      request && selecting.has(request.kind) ? choices[0] : undefined;
    const selectedPick =
      !!pick &&
      (selected.includes(pick.index) ||
        (request?.kind === "unselect" && !!pick.forced));
    const field = pick && fieldPosition(card, 0);
    const isLocated =
      !!located &&
      located.player === card.player &&
      located.location === card.location &&
      located.sequence === card.sequence;
    const legalCommands =
      request && ["idle", "battle", "chain"].includes(request.kind)
        ? choices
        : [];
    const name = fetchCard(card.code).text.name || String(card.code);
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
      ...(card.overlay.length
        ? [
            {
              key: "materials",
              label: `${cardWords.materials} (${card.overlay.length})`,
              onClick: () =>
                setPile({
                  player: card.player,
                  location: card.location | 128,
                  sequence: card.sequence,
                }),
            },
          ]
        : []),
      ...(actionFirst
        ? [
            {
              key: "details",
              label: words.details,
              onClick: () => onInspect(card),
            },
          ]
        : []),
    ];
    const upright = placed ? "scene-board-upright" : "";
    const props = {
      "data-testid": "practice-card",
      "data-card-info-id": placed?.infoId,
      "data-card-code": card.code,
      "data-overlay-index": card.overlayIndex,
      "data-material-count": card.overlay.length,
      "data-player": card.player,
      "data-location": card.location,
      "data-sequence": card.sequence,
      "data-actionable": !!choices.length,
      "data-selectable": !!pick,
      "data-selected": selectedPick,
      "data-card-targeted": !!card.targeted,
      "data-located": isLocated,
      "data-facedown": !!(card.position & 10),
      title: `${name} · ${positionLabel(card, language)} · ${counterDescription(
        card.counters,
      )}${
        field
          ? ` · ${fieldPositionLabel(
              card,
              0,
              language,
              (id) => fetchStrings(Region.System, id),
              (player) => (player === 0 ? "A" : "B"),
            )}`
          : ""
      }`,
      "aria-label": name,
      "aria-pressed": pick ? selectedPick : undefined,
      onClick: () => {
        if (pick) onToggle(pick);
        else if (
          !actionFirst ||
          (!legalCommands.length && !card.overlay.length)
        )
          onInspect(card);
      },
    };
    const badges = (
      <>
        {field && (
          <span
            className={`practice-selection-badge ${upright}`}
            data-testid="practice-selection-badge"
            aria-hidden="true"
          >
            {selectedPick ? "✓ " : ""}
            {field.slot ?? fetchStrings(Region.System, field.systemId)}
          </span>
        )}
        {!!card.overlay.length && (
          <span
            className={`practice-material-count ${upright}`}
            data-testid="practice-material-count"
          >
            {card.overlay.length}
          </span>
        )}
      </>
    );
    return (
      <Dropdown
        key={key}
        trigger={["click"]}
        menu={{ items }}
        open={
          pick || (!legalCommands.length && !card.overlay.length)
            ? false
            : undefined
        }
      >
        {placed ? (
          <BoardCard
            {...props}
            className="practice-field-card practice-positioned-card"
            geometry={placed.geometry}
            pose={placed.pose}
            hand={placed.hand}
            code={card.code}
            targeted={card.targeted}
            targetFlash={card.targetFlash}
            style={placed.staged ? { pointerEvents: "none" } : undefined}
          >
            {badges}
          </BoardCard>
        ) : (
          <button className="practice-field-card" type="button" {...props}>
            <YgoCard
              code={card.code}
              width="100%"
              targeted={card.targeted}
              targetFlash={card.targetFlash}
            />
            {badges}
          </button>
        )}
      </Dropdown>
    );
  };
  const pileHost =
    pile && pile.location & 128
      ? frame.cards.find(
          (c) =>
            c.player === pile.player &&
            c.location === (pile.location & 127) &&
            c.sequence === pile.sequence,
        )
      : undefined;
  const pileCards = pileHost
    ? pileHost.overlay.map((_, i) => materialCard(pileHost, i))
    : pile &&
      frame.cards
        .filter((c) => c.player === pile.player && c.location === pile.location)
        .sort((a, b) => b.sequence - a.sequence);
  const visiblePileCards = pileCards || [];
  return (
    <div
      className="practice-mat-viewport"
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
      <SceneBoard
        className="practice-play-area"
        cards={frame.cards}
        materials={frame.materials}
        chains={frame.chains}
        view={0}
        masterRule={practiceProfile.rules}
        information={sceneInformationCards(frame.cards, language, 0, true)}
        showCounts={showZoneCounts}
        names={{ slot: "practice-field-slot", pile: "practice-field-pile" }}
        renderCard={(placed) => cardButton(placed.card, placed.key, placed)}
        slotProps={(address) => {
          const choice =
            request?.kind === "place" ? addressChoices(address)[0] : undefined;
          return {
            "data-testid": "practice-slot",
            "data-selectable": !!choice,
            "data-selected": !!choice && selected.includes(choice.index),
            highlight: !!choice,
            role: choice ? "button" : undefined,
            tabIndex: choice ? 0 : undefined,
            "aria-label": `${
              address.player === 0 ? "A" : "B"
            } ${practiceZoneName(address.location)} ${address.sequence + 1}`,
            onClick: () => {
              if (choice) onToggle(choice);
            },
            onKeyDown: (event) => {
              if (choice && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onToggle(choice);
              }
            },
          };
        }}
        pileProps={({ player, location }, cards) => ({
          "data-testid": "practice-pile",
          role: "button",
          tabIndex: 0,
          "aria-label": `${practiceZoneName(location)} (${cards.length})`,
          onClick: () => setPile({ player, location }),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPile({ player, location });
            }
          },
        })}
      />
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
            ? `${pileHost ? cardWords.materials : ""} ${
                pile.player === 0 ? "A" : "B"
              } · ${practiceZoneName(pile.location & 127)} (${
                pileCards?.length || 0
              })`
            : ""
        }
        width={640}
        centered
      >
        {pile && [1, 64].includes(pile.location) && (
          <p>{clientRevisionMessages(language).pileOrder}</p>
        )}
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
