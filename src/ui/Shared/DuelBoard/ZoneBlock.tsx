import classnames from "classnames";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import type { ZoneRect } from "./geometry";
import styles from "./index.module.scss";

/** Places zone children at the board center; render inside the board plane. */
export const ZoneLayer = ({ children }: { children: ReactNode }) => (
  <div className={styles.layer}>{children}</div>
);

export const zoneRectStyle = (rect: ZoneRect): CSSProperties => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  transform: `translate(-50%, -50%)${
    rect.rotation ? ` rotate(${rect.rotation}deg)` : ""
  }`,
});

/** Stateless zone outline; modes attach their own interaction props. */
export function ZoneBlock({
  rect,
  highlight = false,
  glowing = false,
  disabled = false,
  className,
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  rect: ZoneRect;
  highlight?: boolean;
  glowing?: boolean;
  /** Draws the red "unavailable" cross. */
  disabled?: boolean;
  [data: `data-${string}`]: unknown;
}) {
  return (
    <div
      {...rest}
      className={classnames(styles.block, className, {
        [styles.highlight]: highlight,
        [styles.glowing]: glowing,
      })}
      style={{ ...zoneRectStyle(rect), ...style }}
    >
      {children}
      {disabled && <div className={styles["disabled-cross"]} />}
    </div>
  );
}

/** Pile count badge, kept upright inside a rotated pile. */
export const ZoneCount = ({
  count,
  rect,
  depth = 4,
  className,
}: {
  count: number;
  rect: ZoneRect;
  depth?: number;
  className?: string;
}) => (
  <span
    data-testid="zone-count-badge"
    className={classnames(styles.count, className)}
    style={
      {
        "--zone-count-rotate": `${-rect.rotation}deg`,
        "--zone-count-depth": `${depth}px`,
      } as CSSProperties
    }
  >
    {count}
  </span>
);
