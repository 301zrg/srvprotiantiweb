import { DownOutlined, RightOutlined } from "@ant-design/icons";
import React, { useCallback, useMemo, useState } from "react";
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
import historyStyles from "@/ui/Shared/DuelHistory/index.module.scss";
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
  onInspect = inspect,
  expandEarlier = false,
}: {
  embedded?: boolean;
  onInspect?: (code: number) => void;
  /** Earlier games start open (siding); during a duel they stay folded, so a
   * long match does not keep thousands of rows mounted. */
  expandEarlier?: boolean;
}) => {
  const { language } = useI18N();
  const { historys, games } = useSnapshot(historyStore);
  const { historyOrder, hidePlayerIds } = useSnapshot(settingStore);
  const { selfType, observerSwapped } = useSnapshot(matStore);
  const { players, hostInfo } = useSnapshot(roomStore);
  const words = duelResultMessages(language);
  const observer =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  // Rows keep the Core player of their own game, and who went first changes
  // between games: a player's labels come from what was recorded at the time,
  // never from the live duel state.
  const orderLabel = useCallback(
    (player: number) => (player === 0 ? words.first : words.second),
    [words],
  );
  const selfLabel = useCallback(() => words.self, [words]);
  const opponentLabel = useCallback(() => words.opponent, [words]);
  // Spectators see who the first and second players are; a player already
  // knows "self" and "opponent". Strings as deps keep the callbacks stable.
  const tag = hostInfo?.mode === 2;
  const seatZero = spectatorName(players, tag, 0, false);
  const seatOne = spectatorName(players, tag, 1, false);
  const showIds = observer && !hidePlayerIds;
  const liveSwapped = observerSwapped;
  const swappedGames = games
    .filter((item) => item.swapped)
    .map((item) => item.game)
    .join();
  const playerNames = useMemo(() => {
    const swappedIn = new Set(swappedGames.split(",").map(Number));
    const named = (swapped: boolean) => (player: number) =>
      showIds ? (Number(swapped) === player ? seatZero : seatOne) : undefined;
    const straight = named(false),
      crossed = named(true);
    return (game: number | undefined, live: boolean) =>
      (game === undefined || game === 0 ? live : swappedIn.has(game))
        ? crossed
        : straight;
  }, [showIds, seatZero, seatOne, swappedGames]);
  const rowsOf = (rows: (readonly [number, History])[]) =>
    rows.map(([idx, history]) => (
      <OnlineRow
        key={idx}
        history={history}
        language={language}
        playerLabel={
          observer ? orderLabel : history.opponent ? opponentLabel : selfLabel
        }
        playerName={playerNames(history.game, liveSwapped)}
        onInspect={onInspect}
      />
    ));
  // Keys stay the append index so reordering never re-renders memoized rows.
  const entries = (historys as History[]).map(
    (history, idx) => [idx, history] as const,
  );
  if (historyOrder === "newest") entries.reverse();
  // A single duel has one flat list; a match groups its games under headers.
  const current = games.at(-1)?.game ?? 0;
  const grouped = hostInfo?.mode === 1 && games.length > 0;
  const groups = new Map<number, (readonly [number, History])[]>();
  if (grouped)
    for (const entry of entries) {
      const game = entry[1].game ?? current;
      const rows = groups.get(game);
      if (rows) rows.push(entry);
      else groups.set(game, [entry]);
    }
  const [folds, setFolds] = useState<Record<number, boolean>>({});
  return (
    <HistoryTimeline
      language={language}
      empty={!historys.length}
      embedded={embedded}
      testId="duel-history-content"
    >
      {grouped
        ? [...groups].map(([game, rows]) => {
            const folded = folds[game] ?? (game < current && !expandEarlier);
            const info = games.find((item) => item.game === game);
            return (
              <React.Fragment key={`game-${game}`}>
                <GameHeader
                  game={game}
                  folded={folded}
                  order={gameOrder(info, {
                    observer,
                    hidden: hidePlayerIds,
                    names: [seatZero, seatOne],
                    self: words.self,
                    opponent: words.opponent,
                    me: roomStore.getMePlayer()?.name,
                    rival: roomStore.getOpPlayer()?.name,
                    language,
                  })}
                  language={language}
                  onToggle={() =>
                    setFolds((old) => ({ ...old, [game]: !folded }))
                  }
                />
                {!folded && rowsOf(rows)}
              </React.Fragment>
            );
          })
        : rowsOf(entries)}
    </HistoryTimeline>
  );
};

/** "First A / Second B" for a game header; masked IDs leave what is known. */
function gameOrder(
  info: { swapped: boolean; selfFirst: boolean } | undefined,
  {
    observer,
    hidden,
    names,
    self,
    opponent,
    me,
    rival,
    language,
  }: {
    observer: boolean;
    hidden: boolean;
    names: string[];
    self: string;
    opponent: string;
    me?: string;
    rival?: string;
    language: string;
  },
) {
  if (!info) return "";
  const text = mobileMessages(language);
  const [first, second] = observer
    ? hidden
      ? []
      : info.swapped
      ? [names[1], names[0]]
      : names
    : info.selfFirst
    ? hidden
      ? [self, opponent]
      : [me ?? self, rival ?? opponent]
    : hidden
    ? [opponent, self]
    : [rival ?? opponent, me ?? self];
  return first
    ? `${text.historyFirst} ${first} / ${text.historySecond} ${second}`
    : "";
}

const GameHeader = ({
  game,
  folded,
  order,
  language,
  onToggle,
}: {
  game: number;
  folded: boolean;
  order: string;
  language: string;
  onToggle: () => void;
}) => (
  <button
    type="button"
    className={historyStyles.gameHeader}
    data-testid="duel-history-game"
    data-game={game}
    aria-expanded={!folded}
    onClick={onToggle}
  >
    {folded ? <RightOutlined aria-hidden /> : <DownOutlined aria-hidden />}
    <span>
      {[mobileMessages(language).historyGame(game), order]
        .filter(Boolean)
        .join(" · ")}
    </span>
  </button>
);

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
  onInspect,
}: {
  history: History;
  language: string;
  playerLabel: (player: number) => string;
  playerName: (player: number) => string | undefined;
  onInspect: (code: number) => void;
}) {
  return (
    <HistoryRow
      entry={onlineHistoryEntry(history)}
      language={language}
      playerLabel={playerLabel}
      playerName={playerName}
      onInspect={onInspect}
      testPrefix="duel"
    />
  );
});

export const displayActionHistory = () => {
  if (hasDuelSidebar())
    window.dispatchEvent(new CustomEvent("neos:open-duel-history"));
  else store.isOpen = true;
};
