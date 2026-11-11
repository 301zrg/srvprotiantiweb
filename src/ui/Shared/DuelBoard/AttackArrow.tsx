import "./attackArrow.css";

import type { BoardGeometry } from "./geometry";
import type { SceneAction, Spot } from "./scene";

interface Point {
  x: number;
  y: number;
}

/** A player target is beyond the field rows, inside the scaled board. */
export const attackPlayerPoint = (g: BoardGeometry, near: boolean): Point => ({
  x: 0,
  y: (near ? 1 : -1) * Math.min(g.BOARD_HEIGHT / 2 - 30, g.DECK_ROW_Y + 35),
});

/** Presentation only; each mode owns its attack lifetime and coordinates. */
export function AttackArrow({
  from,
  to,
  direct = false,
  label,
  className = "",
}: {
  from: Point;
  to: Point;
  direct?: boolean;
  label: string;
  className?: string;
}) {
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return (
    <svg
      className={`duel-attack-arrow ${className}`}
      data-testid="attack-arrow"
      data-direct={direct}
      role="img"
      aria-label={label}
    >
      {direct && (
        <circle className="duel-attack-target" cx={to.x} cy={to.y} r="30" />
      )}
      <path
        className="duel-attack-outline"
        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
      />
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <path
        className="duel-attack-tip"
        d={
          direct
            ? "M 6 0 L -32 -22 L -24 0 L -32 22 Z"
            : "M 5 0 L -25 -17 L -19 0 L -25 17 Z"
        }
        transform={`translate(${to.x} ${to.y}) rotate(${angle})`}
      />
      <circle className="duel-attack-source" cx={from.x} cy={from.y} r="10" />
    </svg>
  );
}

/** Core uses location 0 for direct attacks, not a card zone. */
export function SceneAttackArrow({
  action,
  geometry,
  point,
  view,
  label,
  className,
}: {
  action?: SceneAction;
  geometry: BoardGeometry;
  point: (spot: Spot) => Point;
  view: number;
  label: string;
  className?: string;
}) {
  if (action?.kind !== "attack" || !action.from || !action.to) return null;
  const direct = !action.to.location;
  return (
    <AttackArrow
      from={point(action.from)}
      to={
        direct
          ? attackPlayerPoint(geometry, action.to.player === view)
          : point(action.to)
      }
      direct={direct}
      label={label}
      className={className}
    />
  );
}
