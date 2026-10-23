import { ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";

export default (
  container: Container,
  shuffleDeck: ygopro.StocGameMessage.MsgShuffleDeck,
) => {
  const context = container.context;
  playEffect(AudioActionType.SOUND_SHUFFLE);
  const player = shuffleDeck.player;
  for (const card of context.cardStore.at(ygopro.CardZone.DECK, player)) {
    // 把数据抹掉就好了
    card.code = 0;
    card.deckReversed = false;
    card.deckPublicCode = undefined;
    card.location.position = ygopro.CardPosition.FACEDOWN;
    card.meta = { id: 0, data: {}, text: {} };
  }
};
