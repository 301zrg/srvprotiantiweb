import { ygopro } from "@/api";
import { cardStore, isMe } from "@/stores";
import { cardPose } from "@/ui/Shared/DuelBoard/geometry";

import { onlineSpot } from "../../boardSpot";
import { matConfig } from "../../css";
import { deckCardFaceUp } from "../../deckVisibility";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { DECK } = ygopro.CardZone;

export const moveToDeck: MoveFunc = async (props) => {
  const { card, api, signal } = props;
  const { controller, zone } = card.location;
  const { x, y, z, rz, ry, zIndex, height } = cardPose(matConfig, {
    spot: onlineSpot(card.location)!,
    faceDown:
      zone === DECK
        ? !deckCardFaceUp(card, cardStore.deckReversed)
        : !isMe(controller),
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
    zIndex,
    height,

    config: {
      duration: getDuration(),
    },
  });
};
