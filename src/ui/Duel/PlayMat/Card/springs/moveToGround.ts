import { easings } from "@react-spring/web";

import { ygopro } from "@/api";
import { cardStore } from "@/stores";
import { cardPose } from "@/ui/Shared/DuelBoard/geometry";

import {
  isDefensePosition,
  isFaceDownPosition,
  onlineSpot,
} from "../../boardSpot";
import { matConfig } from "../../css";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { TZONE } = ygopro.CardZone;

export const moveToGround: MoveFunc = async (props) => {
  const { card, api, options, signal } = props;
  const { location } = card;
  const { controller, zone, sequence, is_overlay } = location;
  const position = is_overlay
    ? cardStore.at(zone, controller, sequence)?.location.position
    : location.position;
  const { x, y, height, ry, rz, zIndex } = cardPose(matConfig, {
    spot: onlineSpot(location)!,
    defense: isDefensePosition(position),
    faceDown: isFaceDownPosition(position),
    overlay: is_overlay
      ? {
          index: location.overlay_sequence,
          count: cardStore.findOverlay(zone, controller, sequence).length,
        }
      : undefined,
  });

  // 动画
  const isToken = options?.fromZone === TZONE;
  if (isToken) {
    // 如果是Token，直接先移动到那个位置，然后再放大
    api.set({
      x,
      y,
      ry,
      rz,
      height: 0,
    });
  } else {
    await asyncStart(
      api,
      signal,
    )({
      x,
      y,
      height,
      z: is_overlay ? 0 : 200,
      ry,
      rz,
      config: {
        duration: getDuration(),
        clamp: true,
        easing: easings.easeOutSine,
      },
    });
  }

  await asyncStart(
    api,
    signal,
  )({
    height,
    z: 0,
    subZ: isToken ? 100 : 0,
    zIndex,
    config: {
      easing: easings.easeInQuad,
      duration: 100,
      clamp: true,
    },
  });
  if (isToken && !signal?.aborted) api.set({ subZ: 0 });
};
