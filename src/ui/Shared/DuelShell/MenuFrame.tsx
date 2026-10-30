import classNames from "classnames";
import { type ReactNode, useEffect, useRef } from "react";

import styles from "./menu.module.scss";

/** Duel toolbar container: phase bar, a main group (two-column grid when
 * docked in the sidebar) and further buttons. Publishes its height as
 * `--duel-menu-height` so the board area clears the bottom toolbar. */
export const MenuFrame = ({
  docked,
  label,
  phaseBar,
  primary,
  children,
  observing = false,
  testId = "duel-menu",
}: {
  docked: boolean;
  label: string;
  phaseBar: ReactNode;
  primary: ReactNode;
  children?: ReactNode;
  /** Spectating: the phone portrait toolbar keeps one row (see menu.module.scss). */
  observing?: boolean;
  testId?: string;
}) => {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    let frame = 0;
    let previous = "";
    const update = () => {
      const next = `${element.getBoundingClientRect().height}px`;
      if (next !== previous) {
        previous = next;
        document.documentElement.style.setProperty("--duel-menu-height", next);
      }
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--duel-menu-height");
    };
  }, []);
  return (
    <div
      className={classNames(styles["menu-container"], {
        [styles.sidebar]: docked,
        [styles.observing]: observing,
      })}
      ref={menu}
      data-testid={testId}
      role="toolbar"
      aria-label={label}
    >
      {phaseBar}
      <div className={docked ? styles.primary : styles.contents}>{primary}</div>
      {children}
    </div>
  );
};
