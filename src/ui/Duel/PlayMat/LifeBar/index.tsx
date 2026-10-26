import React, { useEffect, useState } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { useEnv } from "@/hook";
import { matStore, type Player, roomStore } from "@/stores";
import { LifeBarView } from "@/ui/Shared/DuelShell/LifeBarView";

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

  const snapTimeLimit = useSnapshot(matStore.timeLimits);
  const [myTimeLimit, setMyTimeLimit] = useState(snapTimeLimit.me);
  const [opTimeLimit, setOpTimeLimit] = useState(snapTimeLimit.op);
  useEffect(() => {
    setMyTimeLimit(snapTimeLimit.me);
  }, [snapTimeLimit.me]);
  useEffect(() => {
    setOpTimeLimit(snapTimeLimit.op);
  }, [snapTimeLimit.op]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMyTimeLimit((time) => time - 1);
      setOpTimeLimit((time) => time - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (useEnv().VITE_IS_AI_MODE) {
      // 如果是AI模式
      // FIXME: 探索一个优雅的、判断当前是不是AI模式的方法，用户手动输入AI也是AI模式
      setMyTimeLimit(240);
      setOpTimeLimit(240);
    }
  }, [currentPlayer]);

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
        timeLimit: flipped ? myTimeLimit : opTimeLimit,
        controller: farController,
      }}
      near={{
        active: observing
          ? currentPlayer === nearController
          : matStore.isMe(currentPlayer),
        name: nearName,
        life: flipped ? opLife : meLife,
        timeLimit: flipped ? opTimeLimit : myTimeLimit,
        controller: nearController,
      }}
    />
  );
};
