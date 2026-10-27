import classNames from "classnames";
import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { isMe, matStore } from "@/stores";
import { withPortalToBody } from "@/ui/Shared";

import styles from "./index.module.scss";

export const Underlying: React.FC<{}> = withPortalToBody(() => {
  const { currentPlayer, selfType, observerView } = useSnapshot(matStore);
  const near =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer
      ? currentPlayer === observerView
      : isMe(currentPlayer);
  return (
    <div
      className={classNames(styles.background, {
        [styles.opponent]: !near,
      })}
    >
      <div className={styles.inner}></div>
    </div>
  );
});
