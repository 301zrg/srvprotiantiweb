import { useLayoutEffect, useRef } from "react";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { cardStore, matStore } from "@/stores";

import { Bg } from "../Bg";
import { Card } from "../Card";
import styles from "./index.module.scss";

// 后面再改名
export const Mat: React.FC = () => {
  const { selfType, observerView } = useSnapshot(matStore);
  const flipped =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer &&
    observerView === 1;
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => {
      const scale = Math.min(
        1,
        element.clientWidth / 1000,
        element.clientHeight / 920,
      );
      element.style.setProperty("--duel-board-scale", String(scale));
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={viewport}
      className={styles.viewport}
      data-testid="duel-board-viewport"
      data-view-controller={flipped ? 1 : matStore.isMe(0) ? 0 : 1}
    >
      <section className={`${styles.mat} duel-mat`}>
        <div className={`${styles.camera} duel-mat-camera`}>
          <div
            className={`${styles.plane} duel-mat-plane`}
            style={
              {
                "--duel-view-rotation": flipped ? "180deg" : "0deg",
              } as React.CSSProperties
            }
          >
            <Bg />
            <div className={`${styles.container} duel-mat-card-container`}>
              <Cards />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const Cards: React.FC = () => {
  const { inner } = useSnapshot(cardStore);
  const length = inner.length;
  return (
    <>
      {Array.from({ length }).map((_, i) => (
        <Card key={inner[i].uuid} idx={i} />
      ))}
    </>
  );
};
