import { ygopro } from "@/api";
import { cardStore, isMe } from "@/stores";

import { matConfig } from "../../css";
import { deckCardFaceUp } from "../../deckVisibility";
import type { MoveFunc } from "./types";
import { asyncStart, getDuration } from "./utils";

const { DECK, EXTRA } = ygopro.CardZone;

export const moveToDeck: MoveFunc = async (props) => {
  const {
    BLOCK_WIDTH,
    COL_GAP,
    DECK_OFFSET_X,
    DECK_ROW_Y,
    DECK_ROTATE_Z,
    DECK_CARD_HEIGHT,
  } = matConfig;
  const { card, api, signal } = props;
  // report
  const { location } = card;
  const { controller, zone, sequence } = location;

  const rightX = DECK_OFFSET_X + 2 * (BLOCK_WIDTH + COL_GAP);
  const leftX = -rightX;
  const bottomY = DECK_ROW_Y;
  const topY = -bottomY;
  let x = isMe(controller) ? rightX : leftX;
  let y = isMe(controller) ? bottomY : topY;
  if (zone === EXTRA) {
    x = isMe(controller) ? leftX : rightX;
  }
  let rz = zone === EXTRA ? DECK_ROTATE_Z : -DECK_ROTATE_Z;
  rz += isMe(controller) ? 0 : 180;
  const z = sequence;

  await asyncStart(
    api,
    signal,
  )({
    x,
    y,
    z,
    rz,
    ry:
      zone === DECK
        ? deckCardFaceUp(card, cardStore.deckReversed)
          ? 0
          : 180
        : isMe(controller)
        ? 0
        : 180,
    zIndex: z,
    height: DECK_CARD_HEIGHT,

    config: {
      duration: getDuration(),
    },
  });
};
