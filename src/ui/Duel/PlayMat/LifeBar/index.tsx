import React, { useEffect, useState } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { matStore, type Player, roomStore } from "@/stores";
import { LifeBarView } from "@/ui/Shared/DuelShell/LifeBarView";
import { clockLeft, duelClock } from "@/variant/duelClock";

export function spectatorName(
  players: readonly (Readonly<Player> | undefined)[],
  tag: boolean,
  controller: number,
  swapped: boolean,
) {
  const seat = controller ^ (swapped ? 1 : 0);
  if (tag)
    return (
      [players[seat * 2]?.name, players[seat * 2 + 1]?.name]
        .filter(Boolean)
        .join(" / ") || "?"
    );
  return players[seat]?.name ?? "?";
}

/** Online life bars: names, LP and turn clocks from the live duel state. */
export const LifeBar: React.FC<{ docked?: boolean }> = ({ docked = false }) => {
  const snapInitInfo = useSnapshot(matStore.initInfo);
  const snapPlayer = useSnapshot(roomStore);
  const { currentPlayer, selfType, observerView, observerSwapped } =
    useSnapshot(matStore);
  const observing =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  const flipped = observing && observerView === 1;
  const nearController = observing ? observerView : matStore.isMe(0) ? 0 : 1;
  const farController = 1 - nearController;

  // Clocks are derived from the last calibration and the elapsed time; the
  // interval only repaints, so missed or throttled callbacks cannot drift.
  const clock = useSnapshot(duelClock);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (clock.running === null) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [clock.running, clock.seq]);
  const timeOf = (controller: number) =>
    duelClock.limit ? clockLeft(controller, now) : undefined;

  const meLife = snapInitInfo.me.life;
  const opLife = snapInitInfo.op.life;
  const farName = observing
    ? spectatorName(
        snapPlayer.players,
        snapPlayer.hostInfo?.mode === 2,
        farController,
        observerSwapped,
      )
    : snapPlayer.getOpPlayer()?.name ?? "?";
  const nearName = observing
    ? spectatorName(
        snapPlayer.players,
        snapPlayer.hostInfo?.mode === 2,
        nearController,
        observerSwapped,
      )
    : snapPlayer.getMePlayer()?.name ?? "?";
  return (
    <LifeBarView
      docked={docked}
      far={{
        active: observing
          ? currentPlayer === farController
          : !matStore.isMe(currentPlayer),
        name: farName,
        life: flipped ? meLife : opLife,
        timeLimit: timeOf(farController),
        timeTotal: clock.limit,
        timing: clock.running === farController,
        controller: farController,
      }}
      near={{
        active: observing
          ? currentPlayer === nearController
          : matStore.isMe(currentPlayer),
        name: nearName,
        life: flipped ? opLife : meLife,
        timeLimit: timeOf(nearController),
        timeTotal: clock.limit,
        timing: clock.running === nearController,
        controller: nearController,
      }}
    />
  );
};
