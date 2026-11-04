import { ygopro } from "@/api/ocgcore/idl/ocgcore";

const { MZONE, SZONE } = ygopro.CardZone;
const { FACEDOWN, FACEDOWN_ATTACK, FACEDOWN_DEFENSE } = ygopro.CardPosition;

/** A card that is face-down now but that this client has already been shown:
 * flipped down after being face-up (Scrap-Iron Scarecrow, Book of Moon) or
 * confirmed by an effect. Returns its code, 0 when not applicable.
 *
 * The host never sends the identity of an opponent's set card, and clears what
 * this client knew when set cards are shuffled or a card moves unseen, so a
 * code that is still here was really revealed. By the rules the card remains
 * private: this is a memory aid, shown as such, never as a face-up card. */
export function rememberedCode(
  card: {
    code: number;
    location: {
      zone: number;
      position: number;
      is_overlay?: boolean;
    };
  },
  ownCardKnown: boolean,
) {
  const { zone, position, is_overlay } = card.location;
  return !ownCardKnown &&
    !is_overlay &&
    card.code > 0 &&
    (zone === MZONE || zone === SZONE) &&
    [FACEDOWN, FACEDOWN_ATTACK, FACEDOWN_DEFENSE].includes(position)
    ? card.code
    : 0;
}
