import classNames from "classnames";
import React, { createContext, type ReactNode, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { fetchCard, fetchStrings, Region } from "@/api";
import { useConfig } from "@/config";
import { useMobileInterface } from "@/hook";
import { settingStore } from "@/stores/settingStore";
import { replayFieldWords } from "@/ui/Shared/DuelBoard/sceneWords";
import type { PhaseKey } from "@/variant/duelPhases";
import { type DuelResult, formatDuelResult } from "@/variant/duelResults";
import { mobileMessages } from "@/variant/mobileMessages";

import { YgoCard } from "../YgoCard";
import styles from "./index.module.scss";

/** Action log shared by online duels, replays and the hand test. Each mode
 * converts its own data into these entries; the rows look the same. */
export type HistoryKind =
  | "move"
  | "effect"
  | "targeted"
  | "confirmed"
  | "attack"
  | "summon"
  | "special"
  | "flip"
  | "set"
  | "position"
  | "draw"
  | "damage"
  | "recover"
  | "lp"
  | "turn"
  | "phase"
  | "announce"
  | "result"
  | "win";

/** A zone as the online protocol counts it (deck 0 … extra 6). */
export interface HistoryPlace {
  zone: number;
  sequence?: number;
  overlay?: boolean;
  /** Attack target: none, a direct attack. */
  direct?: boolean;
}

export interface DuelHistoryEntry {
  kind: HistoryKind;
  /** Card shown; 0 is a face-down card. */
  code?: number;
  player?: number;
  from?: HistoryPlace;
  to?: HistoryPlace;
  turn?: number;
  phase?: PhaseKey;
  amount?: number;
  result?: DuelResult;
  /** Win reason. */
  text?: string;
}

const coreZones: Record<number, number> = {
  1: 0,
  2: 1,
  4: 2,
  8: 3,
  16: 4,
  32: 5,
  64: 6,
};
/** Core location bits (replays, the hand test) to a history place. */
export const corePlace = (spot: {
  location: number;
  sequence?: number;
}): HistoryPlace | undefined =>
  coreZones[spot.location & 127] === undefined
    ? undefined
    : {
        zone: coreZones[spot.location & 127],
        sequence: spot.sequence,
        overlay: !!(spot.location & 128),
      };

const zoneWords = {
  cn: {
    extraMonster: "额外怪兽区",
    field: "场地区",
    pendulum: "灵摆区",
    material: "超量素材",
    direct: "直接攻击",
  },
  en: {
    extraMonster: "Extra Monster Zone",
    field: "Field Zone",
    pendulum: "Pendulum Zone",
    material: "material",
    direct: "Direct attack",
  },
  ja: {
    extraMonster: "エクストラモンスターゾーン",
    field: "フィールドゾーン",
    pendulum: "ペンデュラムゾーン",
    material: "エクシーズ素材",
    direct: "ダイレクトアタック",
  },
  ko: {
    extraMonster: "엑스트라 몬스터 존",
    field: "필드 존",
    pendulum: "펜듈럼 존",
    material: "엑시즈 소재",
    direct: "직접 공격",
  },
};
const facedownWords = {
  cn: "里侧卡",
  en: "Face-down card",
  ja: "裏側のカード",
  ko: "뒷면 카드",
};

/** Text rows instead of card art ("auto": text on the mobile interface). */
export function useHistoryTextMode() {
  const { historyStyle } = useSnapshot(settingStore);
  const mobile = useMobileInterface();
  return historyStyle === "text" || (historyStyle === "auto" && mobile);
}
// Provided once by the timeline so memoized rows need no per-row listeners.
const TextModeContext = createContext(false);

const zoneText = (language: string) =>
  zoneWords[language as keyof typeof zoneWords] ?? zoneWords.cn;

/** Zone name with the slot on the field, e.g. "怪兽区 3", "额外怪兽区". */
export function placeText(place: HistoryPlace, language: string) {
  const words = zoneText(language);
  if (place.direct) return words.direct;
  const base = fetchStrings(Region.System, place.zone + 1000);
  const sequence = place.sequence;
  if (place.overlay) return `${base} · ${words.material}`;
  if (sequence === undefined) return base;
  if (place.zone === 2)
    return sequence >= 5 ? words.extraMonster : `${base} ${sequence + 1}`;
  if (place.zone === 3)
    return sequence === 5
      ? words.field
      : sequence > 5
      ? words.pendulum
      : `${base} ${sequence + 1}`;
  return base;
}

const icons: Partial<Record<HistoryKind, string>> = {
  move: "arrow.svg",
  position: "arrow.svg",
  effect: "effect.png",
  targeted: "targeted.png",
  confirmed: "confirmed.png",
  attack: "attack.png",
  set: "set.png",
};

function opText(
  kind: HistoryKind,
  t: (key: string) => string,
  language: string,
) {
  const words = replayFieldWords(language);
  switch (kind) {
    case "move":
      return t("Move");
    case "effect":
      return fetchStrings(Region.System, 1150);
    case "targeted":
      return t("Targeted");
    case "confirmed":
      return t("Reveal");
    case "attack":
      return fetchStrings(Region.System, 1157);
    case "summon":
      return fetchStrings(Region.System, 1151);
    case "special":
      return fetchStrings(Region.System, 1152);
    case "flip":
      return fetchStrings(Region.System, 1154);
    case "set":
      return fetchStrings(Region.System, 1153);
    default:
      return words[kind as keyof typeof words] ?? "";
  }
}

export interface HistoryRowProps {
  entry: DuelHistoryEntry;
  language: string;
  /** Stable across renders, so memoized rows stay put. */
  playerLabel: (player: number) => string;
  onInspect: (code: number) => void;
  /** Test id prefix of the mode: duel, replay or practice. */
  testPrefix: string;
}

const HistoryCard = ({
  code,
  className,
  width,
  onInspect,
  testPrefix,
}: {
  code: number;
  className?: string;
  width?: string;
  onInspect: (code: number) => void;
  testPrefix: string;
}) => (
  <button
    type="button"
    data-testid={`${testPrefix}-history-card`}
    data-card-code={code}
    disabled={!code}
    title={code ? fetchCard(code).text.name : undefined}
    style={{
      border: 0,
      padding: 0,
      background: "transparent",
      cursor: code ? "pointer" : "default",
      flexShrink: 0,
    }}
    onClick={() => {
      if (code) onInspect(code);
    }}
  >
    <YgoCard code={code} className={className} width={width} />
  </button>
);

/** Card name in text rows; still opens the card detail. */
const HistoryCardName = ({
  code,
  language,
  onInspect,
  testPrefix,
}: {
  code: number;
  language: string;
  onInspect: (code: number) => void;
  testPrefix: string;
}) =>
  code ? (
    <button
      type="button"
      className={styles.cardName}
      data-testid={`${testPrefix}-history-card`}
      data-card-code={code}
      onClick={() => onInspect(code)}
    >
      {fetchCard(code).text.name ?? code}
    </button>
  ) : (
    <span className={styles.facedown}>
      {facedownWords[language as keyof typeof facedownWords] ??
        facedownWords.en}
    </span>
  );

// Memoized: logs stay mounted and grow all match long, so a new entry must
// not re-render every earlier one.
export const HistoryRow: React.FC<HistoryRowProps> = React.memo(
  function HistoryRow({ entry, language, playerLabel, onInspect, testPrefix }) {
    const { t } = useTranslation("ClientUI");
    const { assetsPath } = useConfig();
    const textMode = useContext(TextModeContext);
    const words = replayFieldWords(language);
    const { kind, code = 0, player, turn, phase } = entry;
    const who = player === undefined ? "" : playerLabel(player);
    const turnText = turn ? `T${turn}` : "";
    if (kind === "turn")
      return (
        <div className={styles.divider} data-history-kind={kind}>
          {[turnText, who, words.turn].filter(Boolean).join(" · ")}
        </div>
      );
    if (kind === "phase")
      return (
        <div
          className={classNames(styles.divider, styles.phase)}
          data-history-kind={kind}
        >
          {[turnText, phase?.toUpperCase()].filter(Boolean).join(" · ")}
        </div>
      );
    // Declarations and results name the player in their own title, as before.
    const titled = kind === "result" || kind === "announce";
    const titleOf = (title: string) => (who ? `${who} · ${title}` : title);
    const tag = [
      [turnText, phase?.toUpperCase()].filter(Boolean).join(" · "),
      titled ? "" : who,
    ]
      .filter(Boolean)
      .join(" · ");
    const card = (width?: string, className?: string) => (
      <HistoryCard
        code={code}
        width={width}
        className={className}
        onInspect={onInspect}
        testPrefix={testPrefix}
      />
    );
    const name = (
      <HistoryCardName
        code={code}
        language={language}
        onInspect={onInspect}
        testPrefix={testPrefix}
      />
    );
    let body: ReactNode;
    if (textMode && kind === "result" && entry.result) {
      const formatted = formatDuelResult(entry.result, language);
      body = (
        <div
          className={styles.textRow}
          data-testid={`${testPrefix}-history-result`}
          data-result-kind={entry.result.kind}
          data-player={player}
        >
          <strong>{titleOf(formatted.title)}</strong>
          {code > 0 && name}
          <span data-testid={`${testPrefix}-history-result-value`}>
            {formatted.value}
          </span>
        </div>
      );
    } else if (textMode && kind === "announce")
      body = (
        <div
          className={styles.textRow}
          data-testid={`${testPrefix}-history-announce`}
        >
          <strong>{titleOf(mobileMessages(language).declaredCard)}</strong>
          {name}
        </div>
      );
    else if (kind === "result" && entry.result) {
      const formatted = formatDuelResult(entry.result, language);
      body = (
        <div
          className={styles.announcement}
          data-testid={`${testPrefix}-history-result`}
          data-result-kind={entry.result.kind}
          data-player={player}
        >
          {code > 0 && card("3rem")}
          <div className={styles.resultText}>
            <strong>{titleOf(formatted.title)}</strong>
            {code > 0 && <div>{fetchCard(code).text.name ?? code}</div>}
            <div data-testid={`${testPrefix}-history-result-value`}>
              {formatted.value}
            </div>
          </div>
        </div>
      );
    } else if (kind === "announce")
      body = (
        <div
          className={styles.announcement}
          data-testid={`${testPrefix}-history-announce`}
        >
          {card("3rem")}
          <div>
            <strong>{titleOf(mobileMessages(language).declaredCard)}</strong>
            <div>{fetchCard(code).text.name ?? code}</div>
          </div>
        </div>
      );
    else if (kind === "win")
      body = (
        <div className={styles.announcement}>
          <div className={styles.resultText}>
            <strong>{entry.text}</strong>
          </div>
        </div>
      );
    else if (["damage", "recover", "lp", "draw"].includes(kind))
      body = (
        <div
          className={classNames(styles.note, {
            [styles.damage]: kind === "damage",
            [styles.recover]: kind === "recover",
          })}
        >
          {words[kind as keyof typeof words]}{" "}
          {kind === "draw" ? `×${entry.amount ?? 1}` : entry.amount ?? ""}
        </div>
      );
    else if (textMode)
      body = (
        <div className={styles.textRow}>
          {name}
          <span className={styles.textOp}>{opText(kind, t, language)}</span>
          {entry.from && <span>{placeText(entry.from, language)}</span>}
          {entry.to && (
            <span className={styles.textTarget}>
              → {placeText(entry.to, language)}
            </span>
          )}
        </div>
      );
    else {
      const icon = icons[kind] ?? "summon.png";
      body = (
        <div className={styles.history}>
          <div className={styles["card-container"]}>
            {card(undefined, styles.card)}
            {entry.from && (
              <div className={styles.location}>
                {placeText(entry.from, language)}
              </div>
            )}
          </div>
          <div className={styles["op-container"]}>
            <div className={styles["op-text"]}>{opText(kind, t, language)}</div>
            <img src={`${assetsPath}/${icon}`} className={styles["op-icon"]} />
          </div>
          {entry.to && (
            <div className={styles.target}>{placeText(entry.to, language)}</div>
          )}
        </div>
      );
    }
    return (
      <div
        className={classNames(styles.entry, { [styles.textEntry]: textMode })}
        data-history-kind={kind}
      >
        {tag && <div className={styles.tag}>{tag}</div>}
        {body}
      </div>
    );
  },
);

/** List frame with the empty text; rows come from the caller. */
export function HistoryTimeline({
  language,
  empty,
  embedded = false,
  testId,
  className,
  children,
}: {
  language: string;
  empty: boolean;
  embedded?: boolean;
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  const textMode = useHistoryTextMode();
  return (
    <div
      className={classNames(styles.container, className, {
        [styles.embedded]: embedded,
        [styles.text]: textMode,
      })}
      data-testid={testId}
      data-history-style={textMode ? "text" : "image"}
    >
      {empty && <p>{mobileMessages(language).emptyHistory}</p>}
      <TextModeContext.Provider value={textMode}>
        <div className={styles.timeline}>{children}</div>
      </TextModeContext.Provider>
    </div>
  );
}

/** Rows that the history keeps: turn starts and battle phases get their own
 * separator; other phases only show in each row's tag. */
export const keepsPhase = (phase: PhaseKey | undefined, previous?: PhaseKey) =>
  phase === "bp" && previous !== "bp";
