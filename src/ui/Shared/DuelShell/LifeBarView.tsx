import { Progress } from "antd";
import classNames from "classnames";
import React, { type ReactNode, useEffect, useState } from "react";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { displayPlayerId } from "@/variant/playerIds";

import styles from "./lifeBar.module.scss";

const LIFE_ANIMATION_DURATION = 500;

export interface LifeBarPlayer {
  name: string;
  life: number;
  /** Whose turn it is. */
  active: boolean;
  controller: number;
  /** Remaining seconds; omitted where there is no clock (replays,
   * spectating, rooms without a limit). Both players show their clock. */
  timeLimit?: number;
  /** The room's limit, for the ring; the clock is hidden without it. */
  timeTotal?: number;
  /** This player's response is being timed (separate from whose turn). */
  timing?: boolean;
  /** Extra line under the LP, e.g. a replay's hand count. */
  extra?: ReactNode;
}

/** Both players' life bars; the far player first. Purely presentational:
 * online duels and replays supply their own values. */
export const LifeBarView: React.FC<{
  far: LifeBarPlayer;
  near: LifeBarPlayer;
  docked?: boolean;
  /** Game of a match (G1-G3); the docked sidebar shows it in its status. */
  game?: number;
}> = ({ far, near, docked = false, game }) => (
  <div className={classNames(styles.container, { [styles.sidebar]: docked })}>
    <LifeBarItem {...far} isMe={false} />
    <LifeBarItem {...near} isMe={true} />
    {!docked && !!game && (
      <span className={styles.game} data-testid="duel-game-badge">
        G{game}
      </span>
    )}
  </div>
);

const LifeBarItem: React.FC<LifeBarPlayer & { isMe: boolean }> = ({
  active,
  name,
  life,
  timeLimit,
  timeTotal,
  timing = false,
  isMe,
  controller,
  extra,
}) => {
  const { hidePlayerIds } = useSnapshot(settingStore);
  const animatedLife = useAnimatedLifeNumber(life);
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
          {displayPlayerId(name, hidePlayerIds)}
        </div>
        <div
          className={styles.life}
          data-testid="duel-player-life-value"
          data-player={isMe ? "me" : "op"}
          data-target-life={life}
        >
          {animatedLife}
        </div>
        {extra && <div className={styles.extra}>{extra}</div>}
      </div>
      {timeLimit !== undefined && !!timeTotal && (
        <div
          className={classNames(styles["timer-container"], {
            [styles.timing]: timing,
          })}
          data-testid="duel-player-clock"
          data-player={isMe ? "me" : "op"}
          data-timing={timing}
          data-seconds={timeLimit}
        >
          <Progress
            type="circle"
            percent={Math.min(100, Math.floor((timeLimit / timeTotal) * 100))}
            strokeWidth={20}
            size={14}
          />
          <div className={styles["timer-text"]}>{formatTime(timeLimit)}</div>
        </div>
      )}
    </div>
  );
};

const formatTime = (timeLimit: number) => {
  if (timeLimit < 0) return "00:00";
  const mm = Math.floor(timeLimit / 60);
  const ss = timeLimit % 60;
  return `${mm < 10 ? "0" + mm : mm}:${ss < 10 ? "0" + ss : ss}`;
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
