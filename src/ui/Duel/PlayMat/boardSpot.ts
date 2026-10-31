import { ygopro } from "@/api";
import { isMe } from "@/stores";
import type { BoardSpot, BoardZone } from "@/ui/Shared/DuelBoard/geometry";

const { DECK, HAND, MZONE, SZONE, GRAVE, REMOVED, EXTRA } = ygopro.CardZone;
const zones: Partial<Record<ygopro.CardZone, BoardZone>> = {
  [DECK]: "deck",
  [HAND]: "hand",
  [MZONE]: "monster",
  [SZONE]: "spell",
  [GRAVE]: "grave",
  [REMOVED]: "removed",
  [EXTRA]: "extra",
};

/** Online address -> shared board spot; the viewer's own side is near. */
export function onlineSpot(
  location: Pick<ygopro.CardLocation, "controller" | "zone" | "sequence">,
): BoardSpot | undefined {
  const zone = zones[location.zone];
  return (
    zone && {
      zone,
      near: isMe(location.controller),
      sequence: location.sequence,
    }
  );
}

const { DEFENSE, FACEUP_DEFENSE, FACEDOWN_DEFENSE, FACEDOWN, FACEDOWN_ATTACK } =
  ygopro.CardPosition;
export const isDefensePosition = (position?: ygopro.CardPosition) =>
  [DEFENSE, FACEUP_DEFENSE, FACEDOWN_DEFENSE].includes(position ?? 5);
export const isFaceDownPosition = (position?: ygopro.CardPosition) =>
  [FACEDOWN, FACEDOWN_ATTACK, FACEDOWN_DEFENSE].includes(position ?? 5);
