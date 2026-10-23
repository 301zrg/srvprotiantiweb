import { fetchStrings, Region, ygopro } from "@/api";
import type { CardType } from "@/stores";
import { onlineFieldSpot } from "@/stores/fieldSelectionStore";
import { replayCardWords } from "@/ui/Replay/cardState";
import type { InformationCard } from "@/ui/Shared/CardInformation";
import { fieldPositionLabel } from "@/variant/fieldSelection";

type OnlineInformationSource = Pick<
  CardType,
  "uuid" | "code" | "counters" | "equipTarget" | "cardTargets"
> & {
  location: Pick<
    CardType["location"],
    "controller" | "zone" | "sequence" | "position" | "is_overlay"
  >;
  meta: { text: { name?: string } };
};

export function onlineInformationCards(
  cards: readonly OnlineInformationSource[],
  language: string,
  view: number,
  knowsOwnCards = true,
): InformationCard[] {
  return cards
    .filter((card) => !card.location.is_overlay)
    .map((card) => {
      const hidden =
        !card.code ||
        ((card.location.controller !== view || !knowsOwnCards) &&
          [
            ygopro.CardPosition.FACEDOWN,
            ygopro.CardPosition.FACEDOWN_ATTACK,
            ygopro.CardPosition.FACEDOWN_DEFENSE,
          ].includes(card.location.position));
      const spot = onlineFieldSpot(card.location);
      return {
        id: card.uuid,
        code: hidden ? 0 : card.code,
        name: hidden
          ? replayCardWords(language).facedown
          : card.meta.text.name || String(card.code),
        position: spot
          ? fieldPositionLabel(spot, view, language, (id) =>
              fetchStrings(Region.System, id),
            )
          : `${fetchStrings(Region.System, 1000 + card.location.zone)} #${
              card.location.sequence + 1
            }`,
        hidden,
        equipTarget: card.equipTarget,
        cardTargets: card.cardTargets,
        counters: card.counters,
      };
    });
}
