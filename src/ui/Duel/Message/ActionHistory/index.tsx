import React, { useCallback } from "react";
import { proxy, useSnapshot } from "valtio";

import { fetchCard, ygopro } from "@/api";
import { useMediaQuery } from "@/hook";
import {
  History,
  HistoryOp,
  historyStore,
  matStore,
  roomStore,
} from "@/stores";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import {
  type DuelHistoryEntry,
  type HistoryKind,
  type HistoryPlace,
  HistoryRow,
  HistoryTimeline,
} from "@/ui/Shared/DuelHistory";
import {
  DuelPanel,
  duelSidebarQuery,
  hasDuelSidebar,
} from "@/ui/Shared/DuelPanel";
import { duelResultMessages } from "@/variant/duelResults";
import { mobileMessages } from "@/variant/mobileMessages";

import { spectatorName } from "../../PlayMat/LifeBar";
import { showCardModal } from "../CardModal";

const defaultStore = {
  isOpen: false,
};

const store = proxy(defaultStore);

export const ActionHistory: React.FC = () => {
  const { language } = useI18N();
  const text = mobileMessages(language);
  const { isOpen } = useSnapshot(store);
  const wide = useMediaQuery(duelSidebarQuery);
  if (wide) return null;
  return (
    <DuelPanel
      followControlSide
      open={isOpen}
      placement="right"
      onClose={() => (store.isOpen = false)}
      title={text.history}
      testId="duel-history-panel"
    >
      <ActionHistoryContent />
    </DuelPanel>
  );
};

export const ActionHistoryContent = ({
  embedded = false,
}: {
  embedded?: boolean;
}) => {
  const { language } = useI18N();
  const { historys } = useSnapshot(historyStore);
  const { historyOrder, hidePlayerIds } = useSnapshot(settingStore);
  const { selfType, observerSwapped } = useSnapshot(matStore);
  const { players, hostInfo } = useSnapshot(roomStore);
  const words = duelResultMessages(language);
  const observer =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  const playerLabel = useCallback(
    (player: number) =>
      observer
        ? player === 0
          ? words.first
          : words.second
        : matStore.isMe(player)
        ? words.self
        : words.opponent,
    [observer, words],
  );
  // Spectators see who the first and second players are; a player already
  // knows "self" and "opponent". Strings as deps keep the callback stable.
  const tag = hostInfo?.mode === 2;
  const firstId = spectatorName(players, tag, 0, observerSwapped);
  const secondId = spectatorName(players, tag, 1, observerSwapped);
  const showIds = observer && !hidePlayerIds;
  const playerName = useCallback(
    (player: number) =>
      showIds ? (player === 0 ? firstId : secondId) : undefined,
    [showIds, firstId, secondId],
  );
  // Keys stay the append index so reordering never re-renders memoized rows.
  const entries = historys.map((history, idx) => [idx, history] as const);
  if (historyOrder === "newest") entries.reverse();
  return (
    <HistoryTimeline
      language={language}
      empty={!historys.length}
      embedded={embedded}
      testId="duel-history-content"
    >
      {entries.map(([idx, history]) => (
        <OnlineRow
          key={idx}
          history={history as History}
          language={language}
          playerLabel={playerLabel}
          playerName={playerName}
        />
      ))}
    </HistoryTimeline>
  );
};

const inspect = (code: number) => showCardModal({ meta: fetchCard(code) });
const place = (
  location?: ygopro.CardLocation,
  zone?: ygopro.CardZone,
): HistoryPlace | undefined =>
  location
    ? {
        zone: location.zone,
        sequence: location.sequence,
        overlay: location.is_overlay,
      }
    : zone === undefined
    ? undefined
    : { zone };

const kinds: Record<HistoryOp, HistoryKind> = {
  [HistoryOp.MOVE]: "move",
  [HistoryOp.EFFECT]: "effect",
  [HistoryOp.TARGETED]: "targeted",
  [HistoryOp.CONFIRMED]: "confirmed",
  [HistoryOp.ATTACK]: "attack",
  [HistoryOp.SUMMON]: "summon",
  [HistoryOp.SP_SUMMON]: "special",
  [HistoryOp.FLIP_SUMMON]: "flip",
  [HistoryOp.SET]: "set",
  [HistoryOp.ANNOUNCE]: "announce",
  [HistoryOp.RESULT]: "result",
  [HistoryOp.TURN]: "turn",
  [HistoryOp.PHASE]: "phase",
  [HistoryOp.DAMAGE]: "damage",
  [HistoryOp.RECOVER]: "recover",
  [HistoryOp.LP]: "lp",
  [HistoryOp.DRAW]: "draw",
  [HistoryOp.POSITION]: "position",
  [HistoryOp.WIN]: "win",
};

export function onlineHistoryEntry(history: History): DuelHistoryEntry {
  const kind = kinds[history.operation];
  const summon = ["summon", "special", "flip", "set"].includes(kind);
  return {
    kind,
    code: history.card,
    player: history.player,
    turn: history.turn,
    phase: history.phase,
    amount: history.amount,
    result: history.result,
    text: history.text,
    from: summon ? undefined : place(history.currentLocation),
    to:
      kind === "attack"
        ? history.attackTarget
          ? place(history.attackTarget)
          : { zone: 0, direct: true }
        : summon || kind === "move"
        ? place(history.targetLocation, history.target)
        : undefined,
  };
}

// Converted inside the memoized row: the store entry keeps its identity.
const OnlineRow = React.memo(function OnlineRow({
  history,
  language,
  playerLabel,
  playerName,
}: {
  history: History;
  language: string;
  playerLabel: (player: number) => string;
  playerName: (player: number) => string | undefined;
}) {
  return (
    <HistoryRow
      entry={onlineHistoryEntry(history)}
      language={language}
      playerLabel={playerLabel}
      playerName={playerName}
      onInspect={inspect}
      testPrefix="duel"
    />
  );
});

export const displayActionHistory = () => {
  if (hasDuelSidebar())
    window.dispatchEvent(new CustomEvent("neos:open-duel-history"));
  else store.isOpen = true;
};
