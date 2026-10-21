import { Button, Input, InputNumber } from "antd";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchCard,
  fetchStrings,
  getStrings,
  Region,
  searchCards,
} from "@/api";
import { isDeclarable, isToken } from "@/common";
import { emptySearchConditions } from "@/middleware/sqlite/fts";
import {
  encodePracticeAnswer,
  type PracticeAnswer,
  type PracticeChoice,
  type PracticeRequest,
} from "@/practice/prompts";
import { duelInteractionMessages } from "@/variant/duelInteraction";
import {
  fieldPosition,
  fieldPositionLabel,
  fieldSelectionMessages,
  type FieldSpot,
} from "@/variant/fieldSelection";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { FieldSelectionGrid } from "../Duel/FieldSelection";
import { replayCardWords } from "../Replay/cardState";
import { replayFieldWords } from "../Replay/FieldBoard";
import type { SceneCard } from "../Replay/scene";
import { YgoCard } from "../Shared";
import { practiceEffectText } from "./presentation";

const system = (id: number) => fetchStrings(Region.System, id);
const zone = (location: number) =>
  system(
    (
      {
        1: 1000,
        2: 1001,
        4: 1002,
        8: 1003,
        16: 1004,
        32: 1005,
        64: 1006,
        128: 1007,
      } as Record<number, number>
    )[location] || 1007,
  );

export function PracticeChoices({
  request,
  language,
  disabled,
  onAnswer,
  onInspectChain,
  chainContext,
  selected: controlledSelected,
  onSelectedChange,
  onToggle,
  onHighlight,
  onLocate,
  targetedCards = [],
}: {
  request: PracticeRequest;
  language: string;
  disabled: boolean;
  onAnswer: (request: PracticeRequest, answer: PracticeAnswer) => void;
  onInspectChain?: () => void;
  chainContext?: string;
  selected?: number[];
  onSelectedChange?: Dispatch<SetStateAction<number[]>>;
  onToggle?: (choice: PracticeChoice) => void;
  onHighlight?: (spot: FieldSpot) => void;
  onLocate?: (spot: FieldSpot) => void;
  targetedCards?: readonly Pick<
    SceneCard,
    "player" | "location" | "sequence" | "targeted"
  >[];
}) {
  const { t } = useTranslation("ClientUI");
  const words = previewMessages(language),
    actions = replayFieldWords(language),
    cardWords = replayCardWords(language);
  const [localSelected, setLocalSelected] = useState<number[]>([]);
  const selected = controlledSelected ?? localSelected;
  const setSelected = onSelectedChange ?? setLocalSelected;
  const [counts, setCounts] = useState<number[]>(request.choices.map(() => 0));
  const [query, setQuery] = useState("");
  const [declared, setDeclared] = useState<PracticeChoice[]>([]);
  const answer = request.kind === "counter" ? counts : selected;
  const emptyChain = request.kind === "chain" && !request.choices.length;
  const fieldWords = fieldSelectionMessages(language);
  const spatial = ["cards", "tribute", "sum", "unselect", "sort"].includes(
    request.kind,
  );
  const owner = (player: number) => (player === 0 ? "A" : "B");
  const address = (choice: PracticeChoice): FieldSpot | undefined => {
    if (
      !spatial ||
      choice.player === undefined ||
      choice.location === undefined ||
      choice.sequence === undefined
    )
      return;
    const spot = {
      player: choice.player,
      location: choice.location,
      sequence: choice.sequence,
    };
    return fieldPosition(spot, 0) ? spot : undefined;
  };
  const toggle = (index: number) =>
    setSelected((old) =>
      old.includes(index) ? old.filter((n) => n !== index) : [...old, index],
    );
  const title =
    request.kind === "yesno"
      ? practiceEffectText(
          request,
          system,
          getStrings,
          (code) => fetchCard(code).text.name || String(code),
          zone,
        )
      : request.description && request.kind !== "counter"
      ? getStrings(request.description)
      : request.kind === "sort"
      ? t("SortCards")
      : request.kind === "counter"
      ? t("RemoveCounters", {
          count: request.target,
          counter: fetchStrings(Region.Counter, request.description!),
        })
      : request.kind === "announce"
      ? t("AnnounceTitle")
      : request.kind === "position"
      ? system(561)
      : request.kind === "chain"
      ? emptyChain
        ? `${system(201)}\n${system(202)}`
        : system(550)
      : request.kind === "place"
      ? system(request.message === 24 ? 570 : 571)
      : request.kind === "bits"
      ? system(request.message === 140 ? 563 : 562)
      : request.kind === "idle" || request.kind === "battle"
      ? words.operations
      : t("SelectCard");
  const choicePlace = (c: PracticeChoice) => {
    const spot = address(c);
    return spot
      ? fieldPositionLabel(spot, 0, language, system, owner)
      : c.location !== undefined && c.sequence !== undefined
      ? `${c.player === 0 ? "A" : "B"} · ${zone(c.location & 127)} (${
          c.sequence + 1
        })`
      : "";
  };
  const choiceLabel = (c: PracticeChoice, includePosition = true) => {
    const name = c.code ? fetchCard(c.code).text.name || String(c.code) : "";
    let action = "";
    if (request.kind === "idle")
      action = [
        system(1151),
        system(1152),
        actions.position,
        system(1153),
        actions.set,
        system(1150),
        "BP",
        "EP",
        system(1297),
      ][c.action!];
    if (request.kind === "battle")
      action = [system(1150), system(1157), "MP2", "EP"][c.action!];
    if (request.kind === "chain") action = system(1150);
    if (request.kind === "yesno") action = system(c.value ? 1213 : 1214);
    if (request.kind === "position")
      action = `${c.value! & 10 ? cardWords.facedown : cardWords.faceup} · ${
        c.value! & 12 ? cardWords.defense : cardWords.attack
      }`;
    if (request.kind === "bits")
      action = system((request.message === 140 ? 1020 : 1010) + c.index);
    if (request.message === 143) action = String(c.action);
    if (request.message === 132) action = ["", "✌", "✊", "✋"][c.value!];
    const place = choicePlace(c);
    const description = c.description ? getStrings(c.description) : "";
    return [action, name, description, includePosition ? place : ""]
      .filter(Boolean)
      .join(" · ");
  };
  const immediate = [
    "idle",
    "battle",
    "chain",
    "yesno",
    "option",
    "position",
    "announce",
    "unselect",
  ].includes(request.kind);
  const choices = request.kind === "announce" ? declared : request.choices;
  const chosen = (choice: PracticeChoice) =>
    selected.includes(choice.index) ||
    (request.kind === "unselect" && !!choice.forced);
  const renderChoice = (choice: PracticeChoice, i: number) => {
    const label = choiceLabel(choice);
    const spot = address(choice);
    const position = spot && fieldPosition(spot, 0);
    const isChosen = chosen(choice);
    const targeted = !!targetedCards.find(
      (card) =>
        card.player === choice.player &&
        card.location === choice.location &&
        card.sequence === choice.sequence,
    )?.targeted;
    return request.kind === "counter" ? (
      <label key={choice.index} className="practice-counter">
        <span>
          {label} · {choice.value}
        </span>
        <InputNumber
          aria-label={label}
          min={0}
          max={choice.value}
          value={counts[i]}
          onChange={(value) =>
            setCounts((old) =>
              old.map((n, j) => (i === j ? Number(value || 0) : n)),
            )
          }
        />
      </label>
    ) : (
      <div
        className="practice-choice-option"
        key={`${choice.index}:${choice.action}:${i}`}
        onMouseEnter={() => spot && onHighlight?.(spot)}
      >
        <Button
          className={`practice-choice ${spot ? "field-selection-button" : ""}`}
          type={isChosen ? "primary" : "default"}
          disabled={disabled}
          title={label}
          aria-label={label}
          aria-pressed={spatial || !immediate ? isChosen : undefined}
          data-action={choice.action}
          data-index={choice.index}
          data-selected={isChosen}
          data-card-targeted={targeted}
          data-field-option={!!spot}
          onFocus={() => spot && onHighlight?.(spot)}
          onClick={() => {
            if (request.kind === "unselect") onAnswer(request, [choice.index]);
            else if (immediate) onAnswer(request, choice.value!);
            else if (onToggle) onToggle(choice);
            else toggle(choice.index);
          }}
        >
          {position && (
            <span className="practice-selection-badge" aria-hidden="true">
              {isChosen ? "✓ " : ""}
              {position.slot ?? system(position.systemId)}
            </span>
          )}
          {choice.code && (
            <YgoCard
              code={choice.code}
              targeted={targeted}
              className="practice-choice-artwork"
            />
          )}
          {!position && choicePlace(choice) && (
            <span
              className="practice-selection-location"
              data-testid="practice-selection-location"
            >
              {choicePlace(choice)}
            </span>
          )}
          {targeted && (
            <span
              className="practice-targeted-label"
              data-testid="practice-selection-targeted"
            >
              {t("Targeted")}
            </span>
          )}
          <span className="practice-choice-label">
            {request.kind === "sort" && isChosen
              ? `${selected.indexOf(choice.index) + 1}. `
              : ""}
            {choice.forced && request.kind === "unselect" ? "✓ " : ""}
            {spot ? choiceLabel(choice, false) : label}
          </span>
        </Button>
        {spot && onLocate && (
          <Button
            className="practice-locate-card field-selection-button"
            data-testid="practice-locate-card"
            disabled={disabled}
            onClick={() => onLocate(spot)}
          >
            {fieldWords.locate}
          </Button>
        )}
      </div>
    );
  };
  return (
    <section
      className="practice-choices"
      data-testid="practice-choices"
      data-kind={request.kind}
      data-player={request.player}
      data-request-id={request.id}
      aria-label={title}
    >
      <h2>
        {previewFormat(words.activeSide, {
          player: request.player === 0 ? "A" : "B",
        })}
      </h2>
      {chainContext && (
        <p data-testid="practice-chain-context">{chainContext}</p>
      )}
      <p>
        {request.code ? `${fetchCard(request.code).text.name} · ` : ""}
        {title}
      </p>
      {request.target !== undefined && request.kind === "sum" && (
        <p>
          {request.target} · {request.min}–{request.max || "∞"}
        </p>
      )}
      {!!request.must?.length && (
        <p>
          {request.must
            .map((c) => fetchCard(c.code!).text.name || c.code)
            .join(" · ")}
        </p>
      )}
      {!immediate && request.kind !== "counter" && (
        <p>
          {selected.length} / {request.min}–
          {request.max || (request.kind === "sum" ? "∞" : 0)}
        </p>
      )}
      {request.kind === "announce" && (
        <Input.Search
          value={query}
          placeholder={t("AnnouncePlaceholder")}
          onChange={(e) => setQuery(e.target.value)}
          onSearch={() =>
            setDeclared(
              searchCards({ query, conditions: emptySearchConditions })
                .filter(
                  (card) =>
                    isDeclarable(card, request.opcodes || []) &&
                    !isToken(card.data.type || 0),
                )
                .slice(0, 100)
                .map((card) => ({
                  index: card.id,
                  value: card.id,
                  code: card.id,
                })),
            )
          }
        />
      )}
      <div
        className={`practice-choice-list ${
          spatial ? "practice-choice-grid" : ""
        }`}
      >
        {spatial ? (
          <FieldSelectionGrid
            options={choices}
            address={address}
            viewPlayer={0}
            language={language}
            owner={owner}
            renderOption={(choice) =>
              renderChoice(choice, choices.indexOf(choice))
            }
          />
        ) : (
          choices.map(renderChoice)
        )}
      </div>
      {spatial && (
        <p
          className="practice-selected-positions"
          data-testid="practice-selected-positions"
          aria-live="polite"
        >
          {system(212)}{" "}
          {request.kind === "unselect"
            ? choices.filter(chosen).length
            : selected.length}
          {" · "}
          {choices
            .filter(chosen)
            .map((choice) => choiceLabel(choice))
            .join("; ")}
        </p>
      )}
      <div className="practice-choice-footer">
        {emptyChain && (
          <Button
            type="primary"
            disabled={disabled}
            data-testid="practice-chain-inspect"
            onClick={onInspectChain}
          >
            {system(1213)}
          </Button>
        )}
        {request.cancelable && (
          <Button
            disabled={disabled}
            data-testid="practice-cancel"
            onClick={() => onAnswer(request, -1)}
          >
            {request.kind === "chain" ? system(1214) : t("Cancel")}
          </Button>
        )}
        {!immediate && (
          <>
            <Button
              disabled={disabled}
              onClick={() => {
                setSelected([]);
                setCounts(request.choices.map(() => 0));
              }}
            >
              {duelInteractionMessages(language).reset}
            </Button>
            <Button
              type="primary"
              data-testid="practice-confirm"
              disabled={disabled || !encodePracticeAnswer(request, answer)}
              onClick={() => onAnswer(request, answer)}
            >
              {t("Confirm")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
