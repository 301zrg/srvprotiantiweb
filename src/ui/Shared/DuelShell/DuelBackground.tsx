import classNames from "classnames";
import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./background.module.scss";

/** Duel backdrop; tinted for whose turn it is. `near` is the bottom player.
 * Rendered as the first child of <body>, beneath every page layer. */
export const DuelBackground = ({ near }: { near: boolean }) => {
  const [host] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    document.body.insertBefore(host, document.body.firstChild);
    return () => host.remove();
  }, [host]);
  return createPortal(
    <div
      className={classNames(styles.background, {
        [styles.opponent]: !near,
      })}
    >
      <div className={styles.inner}></div>
    </div>,
    host,
  );
};
