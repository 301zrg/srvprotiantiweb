import React from "react";
import { useTranslation } from "react-i18next";
import { proxy, useSnapshot } from "valtio";

import { fetchCard, fetchStrings, Region, ygopro } from "@/api";
import { useConfig } from "@/config";
import { History, HistoryOp, historyStore, matStore } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { YgoCard } from "@/ui/Shared";
import { DuelPanel } from "@/ui/Shared/DuelPanel";
import { duelResultMessages, formatDuelResult } from "@/variant/duelResults";
import { mobileMessages } from "@/variant/mobileMessages";

import styles from "./index.module.scss";

const { assetsPath } = useConfig();

const defaultStore = {
  isOpen: false,
};

const store = proxy(defaultStore);

export const ActionHistory: React.FC = () => {
  const { language } = useI18N();
  const text = mobileMessages(language);
  const { isOpen } = useSnapshot(store);
  const { historys } = useSnapshot(historyStore);
  return (
    <DuelPanel
      open={isOpen}
      placement="right"
      onClose={() => (store.isOpen = false)}
      title={text.history}
      testId="duel-history-panel"
    >
      <div className={styles.container}>
        {!historys.length && <p>{text.emptyHistory}</p>}
        <div className={styles.timeline}>
          {historys.map((history, idx) => (
            <HistoryItem key={idx} {...(history as History)} />
          ))}
        </div>
      </div>
    </DuelPanel>
  );
};

const HistoryItem: React.FC<History> = ({
  card,
  currentLocation,
  operation,
  target,
  player,
  result,
}) => {
  const { t } = useTranslation("ClientUI");
  const { language } = useI18N();
  const { selfType } = useSnapshot(matStore);
  const words = duelResultMessages(language);
  const playerLabel =
    player === undefined
      ? ""
      : selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer
      ? player === 0
        ? words.first
        : words.second
      : matStore.isMe(player)
      ? words.self
      : words.opponent;
  if (operation === HistoryOp.RESULT && result) {
    const formatted = formatDuelResult(result, language);
    return (
      <div
        className={styles.announcement}
        data-testid="duel-history-result"
        data-result-kind={result.kind}
        data-player={player}
      >
        {card > 0 && <YgoCard code={card} width="3rem" />}
        <div className={styles.resultText}>
          <strong>
            {playerLabel} · {formatted.title}
          </strong>
          {card > 0 && <div>{fetchCard(card).text.name ?? card}</div>}
          <div data-testid="duel-history-result-value">{formatted.value}</div>
        </div>
      </div>
    );
  }
  if (operation === HistoryOp.ANNOUNCE)
    return (
      <div className={styles.announcement} data-testid="duel-history-announce">
        <YgoCard code={card} width="3rem" />
        <div>
          <strong>
            {playerLabel} · {mobileMessages(language).declaredCard}
          </strong>
          <div>{fetchCard(card).text.name ?? card}</div>
        </div>
      </div>
    );
  return (
    <div className={styles.history}>
      <div className={styles["card-container"]}>
        <YgoCard className={styles.card} code={card} />
        {currentLocation && (
          <div className={styles.location}>{`${zone2Text(
            currentLocation.zone,
          )}`}</div>
        )}
      </div>
      <div className={styles["op-container"]}>
        <div className={styles["op-text"]}>{Op2Text(operation, t)}</div>
        {operation === HistoryOp.MOVE ? (
          <img src={`${assetsPath}/arrow.svg`} className={styles["op-icon"]} />
        ) : operation === HistoryOp.EFFECT ? (
          <img src={`${assetsPath}/effect.png`} className={styles["op-icon"]} />
        ) : operation === HistoryOp.TARGETED ? (
          <img
            src={`${assetsPath}/targeted.png`}
            className={styles["op-icon"]}
          />
        ) : operation === HistoryOp.CONFIRMED ? (
          <img
            src={`${assetsPath}/confirmed.png`}
            className={styles["op-icon"]}
          />
        ) : operation === HistoryOp.ATTACK ? (
          <img src={`${assetsPath}/attack.png`} className={styles["op-icon"]} />
        ) : operation === HistoryOp.SET ? (
          <img src={`${assetsPath}/set.png`} className={styles["op-icon"]} />
        ) : (
          <img src={`${assetsPath}/summon.png`} className={styles["op-icon"]} />
        )}
      </div>
      {target && <div className={styles.target}>{`${zone2Text(target)}`}</div>}
    </div>
  );
};

function zone2Text(zone: ygopro.CardZone): string {
  return fetchStrings(Region.System, zone + 1000);
}

function Op2Text(op: HistoryOp, t: (key: string) => string): string {
  switch (op) {
    case HistoryOp.MOVE:
      return t("Move");
    case HistoryOp.EFFECT:
      return fetchStrings(Region.System, 1150);
    case HistoryOp.TARGETED:
      return t("Targeted");
    case HistoryOp.CONFIRMED:
      return t("Reveal");
    case HistoryOp.ATTACK:
      return fetchStrings(Region.System, 1157);
    case HistoryOp.SUMMON:
      return fetchStrings(Region.System, 1151);
    case HistoryOp.SP_SUMMON:
      return fetchStrings(Region.System, 1152);
    case HistoryOp.FLIP_SUMMON:
      return fetchStrings(Region.System, 1154);
    case HistoryOp.SET:
      return fetchStrings(Region.System, 1153);
    case HistoryOp.ANNOUNCE:
    case HistoryOp.RESULT:
      return "";
  }
}

export const displayActionHistory = () => (store.isOpen = true);
