import { Button, Input, InputNumber } from "antd";
import { type Dispatch, type SetStateAction, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchCard,
  fetchStrings,
  getCardImgUrl,
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
import { previewFormat, previewMessages } from "@/variant/previewMessages";

import { replayCardWords } from "../Replay/cardState";
import { replayFieldWords } from "../Replay/FieldBoard";
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
}: {
  request: PracticeRequest;
  language: string;
  disabled: boolean;
  onAnswer: (request: PracticeRequest, answer: PracticeAnswer) => void;
  onInspectChain?: () => void;
  chainContext?: string;
  selected?: number[];
  onSelectedChange?: Dispatch<SetStateAction<number[]>>;
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
  const choiceLabel = (c: PracticeChoice) => {
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
    const place = c.location
      ? `${c.player === 0 ? "A" : "B"} · ${zone(c.location)} · ${
          c.sequence! + 1
        }`
      : "";
    const description = c.description ? getStrings(c.description) : "";
    return [action, name, description, place].filter(Boolean).join(" · ");
  };
  const immediate = [
    "idle",
    "battle",
    "chain",
    "yesno",
    "option",
    "position",
    "announce",
  ].includes(request.kind);
  const choices = request.kind === "announce" ? declared : request.choices;
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
      <div className="practice-choice-list">
        {choices.map((choice, i) => {
          const label = choiceLabel(choice),
            chosen = selected.includes(choice.index);
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
            <Button
              key={`${choice.index}:${choice.action}:${i}`}
              className="practice-choice"
              type={chosen ? "primary" : "default"}
              disabled={disabled}
              aria-pressed={!immediate ? chosen : undefined}
              data-action={choice.action}
              data-index={choice.index}
              onClick={() =>
                immediate
                  ? onAnswer(request, choice.value!)
                  : toggle(choice.index)
              }
            >
              {choice.code && (
                <img src={getCardImgUrl(choice.code)} alt="" loading="lazy" />
              )}
              <span>
                {request.kind === "sort" && chosen
                  ? `${selected.indexOf(choice.index) + 1}. `
                  : ""}
                {choice.forced && request.kind === "unselect" ? "✓ " : ""}
                {label}
              </span>
            </Button>
          );
        })}
      </div>
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
