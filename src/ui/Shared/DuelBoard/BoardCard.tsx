import "./sceneBoard.css";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  forwardRef,
  type ReactNode,
} from "react";

import { YgoCard } from "../YgoCard";
import type { BoardGeometry, CardPose } from "./geometry";

/** Flat boards stack by z-index: field cards and their materials, then the
 * hand above them (the online 3D board uses depth for the same order). */
export const flatLayer = (pose: CardPose, hand: boolean) =>
  (hand ? 20 : 10) + pose.zIndex;

export const poseStyle = (
  g: BoardGeometry,
  pose: CardPose,
  hand: boolean,
): CSSProperties =>
  ({
    left: pose.x,
    top: pose.y,
    height: pose.height,
    width: pose.height * g.CARD_RATIO,
    transform: `translate(-50%, -50%) rotate(${pose.rz}deg)`,
    zIndex: flatLayer(pose, hand),
    "--card-rotation": `${pose.rz}deg`,
  }) as CSSProperties;

/** Card face at a shared pose, for boards without the online 3D springs.
 * Modes add their own data attributes, menus and badges. */
export const BoardCard = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    geometry: BoardGeometry;
    pose: CardPose;
    hand: boolean;
    code: number;
    isBack?: boolean;
    targeted?: boolean;
    targetFlash?: number;
    /** Negated look, as on the online board. */
    disabled?: boolean;
    children?: ReactNode;
    [data: `data-${string}`]: unknown;
  }
>(function BoardCard(
  {
    geometry,
    pose,
    hand,
    code,
    isBack = false,
    targeted,
    targetFlash,
    disabled,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={`scene-board-card ${className ?? ""}`}
      style={{ ...poseStyle(geometry, pose, hand), ...style }}
    >
      <YgoCard
        className="scene-board-face"
        code={code}
        isBack={isBack}
        targeted={targeted}
        targetFlash={targetFlash}
        disabled={disabled}
      />
      {children}
    </button>
  );
});
