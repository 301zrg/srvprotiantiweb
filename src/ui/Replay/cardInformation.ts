import { fetchCard, fetchStrings, Region } from "@/api";
import type { ReplayCard } from "@/replay/messages";
import type { InformationCard } from "@/ui/Shared/CardInformation";
import { fieldPositionLabel } from "@/variant/fieldSelection";

import { concealReplayCard, replayCardWords } from "./cardState";
import type { SceneCard } from "./scene";

export function sceneInformationCards(
  cards: readonly SceneCard[],
  language: string,
  view: number,
  reveal: boolean,
): InformationCard[] {
  return cards.map((card) => {
    const hidden = !card.code || concealReplayCard(card, reveal);
    return {
      id: card.sceneId,
      code: hidden ? 0 : card.code,
      name: hidden
        ? replayCardWords(language).facedown
        : fetchCard(card.code).text.name || String(card.code),
      position:
        fieldPositionLabel(card, view, language, (id) =>
          fetchStrings(Region.System, id),
        ) ||
        `${fetchStrings(
          Region.System,
          (
            { 1: 1000, 2: 1001, 16: 1004, 32: 1005, 64: 1006 } as Record<
              number,
              number
            >
          )[card.location] ?? 1007,
        )} #${card.sequence + 1}`,
      hidden,
      counters: card.counters,
      equipTarget: card.equipTarget,
      cardTargets: card.cardTargets,
    };
  });
}

export function sceneInformationId(
  cards: readonly SceneCard[],
  card?: ReplayCard,
) {
  return (
    card &&
    cards.find(
      (c) =>
        c.player === card.player &&
        c.location === card.location &&
        c.sequence === card.sequence &&
        c.code === card.code,
    )?.sceneId
  );
}
