import { ygopro } from "@/api/ocgcore/idl/ocgcore";

export function deckCardFaceUp(
  card: {
    deckReversed?: boolean;
    location: { position?: ygopro.CardPosition };
  },
  reversed: boolean,
) {
  const individual =
    card.deckReversed ??
    [
      ygopro.CardPosition.FACEUP,
      ygopro.CardPosition.FACEUP_ATTACK,
      ygopro.CardPosition.FACEUP_DEFENSE,
    ].includes(card.location.position ?? ygopro.CardPosition.FACEDOWN);
  return individual !== reversed;
}

/** Whole-deck reversal does not grant identities absent from server messages. */
export function visibleDeckCode(
  card: Parameters<typeof deckCardFaceUp>[0] & {
    code: number;
    deckPublicCode?: number;
    confirmedDeckCode?: number;
  },
  reversed: boolean,
) {
  if (card.confirmedDeckCode) return card.confirmedDeckCode;
  if (!deckCardFaceUp(card, reversed)) return 0;
  return card.deckPublicCode ?? (reversed ? 0 : card.code);
}
