import { ygopro } from "@/api";

import { moveToDeck } from "./moveToDeck";
import { moveToGround } from "./moveToGround";
import { moveToHand } from "./moveToHand";
import { moveToOutside } from "./moveToOutside";
import { moveToToken } from "./moveToToken";
import type { MoveFunc } from "./types";

const { HAND, GRAVE, REMOVED, DECK, EXTRA, MZONE, SZONE, TZONE } =
  ygopro.CardZone;

export const move: MoveFunc = async (props) => {
  if (props.card.overlayOrigin) {
    // Logical overlay addresses are authoritative; only rendering stays put
    // until Core sends the host's chosen destination.
    props = {
      ...props,
      card: { ...props.card, location: props.card.overlayOrigin },
    };
  }
  const { card } = props;
  switch (card.location.zone) {
    case MZONE:
    case SZONE:
      await moveToGround(props);
      break;
    case HAND:
      await moveToHand(props);
      break;
    case DECK:
    case EXTRA:
      await moveToDeck(props);
      break;
    case GRAVE:
    case REMOVED:
      await moveToOutside(props);
      break;
    case TZONE:
      await moveToToken(props);
      break;
  }
};
