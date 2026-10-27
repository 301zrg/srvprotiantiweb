import { fetchCard, ygopro } from "@/api";
import type { DeckVisibilityGameMessage } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/deckVisibility";
import type { Container } from "@/container";

export function updateDeckVisibility(
  container: Container,
  message: DeckVisibilityGameMessage["deckVisibility"],
) {
  const store = container.context.cardStore;
  if (message.kind === "reverse") {
    store.deckReversed = !store.deckReversed;
    return;
  }
  const card = store
    .at(ygopro.CardZone.DECK, message.player)
    .sort((a, b) => b.location.sequence - a.location.sequence)[message.offset];
  if (!card) return;
  card.code = message.code;
  card.deckPublicCode = message.code;
  card.meta = fetchCard(message.code);
  card.deckReversed = message.reversed;
}
