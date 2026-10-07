import { Progress } from "antd";
import classNames from "classnames";
import React, { useEffect, useState } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { useEnv } from "@/hook";
import { matStore, type Player, roomStore } from "@/stores";

import styles from "./index.module.scss";

const LIFE_ANIMATION_DURATION = 500;

function spectatorName(
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

export const LifeBar: React.FC = () => {
  const snapInitInfo = useSnapshot(matStore.initInfo);
  const snapPlayer = useSnapshot(roomStore);
  const { currentPlayer, selfType, observerView, observerSwapped } =
    useSnapshot(matStore);
  const observing =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer;
  const flipped = observing && observerView === 1;
  const nearController = observing ? observerView : matStore.isMe(0) ? 0 : 1;
  const farController = 1 - nearController;

  const [meLife, setMeLife] = React.useState(0);
  const [opLife, setOpLife] = React.useState(0);

  useEffect(() => {
    setMeLife(snapInitInfo.me.life);
  }, [snapInitInfo.me.life]);

  useEffect(() => {
    setOpLife(snapInitInfo.op.life);
  }, [snapInitInfo.op.life]);

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

  return (
    <div className={styles.container}>
      <LifeBarItem
        active={
          observing
            ? currentPlayer === farController
            : !matStore.isMe(currentPlayer)
        }
        name={
          observing
            ? spectatorName(
                snapPlayer.players,
                snapPlayer.hostInfo?.mode === 2,
                farController,
                observerSwapped,
              )
            : snapPlayer.getOpPlayer()?.name ?? "?"
        }
        life={flipped ? meLife : opLife}
        timeLimit={flipped ? myTimeLimit : opTimeLimit}
        controller={farController}
        isMe={false}
      />
      <LifeBarItem
        active={
          observing
            ? currentPlayer === nearController
            : matStore.isMe(currentPlayer)
        }
        name={
          observing
            ? spectatorName(
                snapPlayer.players,
                snapPlayer.hostInfo?.mode === 2,
                nearController,
                observerSwapped,
              )
            : snapPlayer.getMePlayer()?.name ?? "?"
        }
        life={flipped ? opLife : meLife}
        timeLimit={flipped ? opTimeLimit : myTimeLimit}
        controller={nearController}
        isMe={true}
      />
    </div>
  );
};

const LifeBarItem: React.FC<{
  active: boolean;
  name: string;
  life: number;
  timeLimit: number;
  isMe: boolean;
  controller: number;
}> = ({ active, name, life, timeLimit, isMe, controller }) => {
  const animatedLife = useAnimatedLifeNumber(life);
  const mm = Math.floor(timeLimit / 60);
  const ss = timeLimit % 60;
  const timeText =
    timeLimit < 0
      ? "00:00"
      : `${mm < 10 ? "0" + mm : mm}:${ss < 10 ? "0" + ss : ss}`;
  return (
    <div
      data-testid="duel-player-life"
      data-player={isMe ? "me" : "op"}
      data-controller={controller}
      data-life={life}
      style={{
        flexDirection: isMe ? "column-reverse" : "column",
        overflow: "hidden",
        display: "flex",
        gap: "0.5rem",
        position: "relative",
      }}
    >
      <div
        className={classNames(styles["life-bar"], {
          "life-bar-activated": active,
        })}
      >
        <div className={styles.name} data-testid="duel-player-name">
          {name}
        </div>
        <div
          className={styles.life}
          data-testid="duel-player-life-value"
          data-player={isMe ? "me" : "op"}
          data-target-life={life}
        >
          {animatedLife}
        </div>
      </div>
      {active && (
        <div className={styles["timer-container"]}>
          <Progress
            type="circle"
            percent={Math.floor((timeLimit / 240) * 100)}
            strokeWidth={20}
            size={14}
          />
          <div className={styles["timer-text"]}>{timeText}</div>
        </div>
      )}
    </div>
  );
};

const useAnimatedLifeNumber = (life: number) => {
  const [displayLife, setDisplayLife] = useState(life);
  const displayLifeRef = React.useRef(life);

  useEffect(() => {
    const from = displayLifeRef.current;
    const to = life;

    if (from === to) return;

    let frame = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / LIFE_ANIMATION_DURATION);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * easedProgress);

      displayLifeRef.current = next;
      setDisplayLife(next);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [life]);

  return displayLife;
};
