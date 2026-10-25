import { ygopro } from "@/api";
import { cardPose } from "@/ui/Shared/DuelBoard/geometry";

import { onlineSpot } from "../../boardSpot";
import { matConfig } from "../../css";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

export const moveToOutside: MoveFunc = async (props) => {
  const { card, api, signal } = props;
  const { x, y, height, rz, ry, zIndex } = cardPose(matConfig, {
    spot: onlineSpot(card.location)!,
    faceDown: card.location.position === ygopro.CardPosition.FACEDOWN,
  });
  await asyncStart(
    api,
    signal,
  )({
    x,
    y,
    z: 0,
    height,
    rz,
    ry,
    subZ: 100,
    zIndex,
    config: {
      duration: getDuration(),
      clamp: true,
    },
  });
  if (!signal?.aborted) api.set({ subZ: 0 });
};
