import { ygopro } from "@/api";
import { cardStore } from "@/stores";
import { cardPose } from "@/ui/Shared/DuelBoard/geometry";

import { onlineSpot } from "../../boardSpot";
import { matConfig } from "../../css";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { HAND } = ygopro.CardZone;

export const moveToHand: MoveFunc = async (props) => {
  const { card, api, signal } = props;
  const { x, y, z, rz, ry, height, zIndex } = cardPose(matConfig, {
    spot: onlineSpot(card.location)!,
    handCount: cardStore.at(HAND, card.location.controller).length,
  });

  await asyncStart(
    api,
    signal,
  )({
    x,
    y,
    z,
    rz,
    ry,
    height,
    zIndex,
    config: {
      duration: getDuration(),
      clamp: true,
    },
  });
};
