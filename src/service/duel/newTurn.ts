import { ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { newTurnClock } from "@/variant/duelClock";

export default (
  container: Container,
  newTurn: ygopro.StocGameMessage.MsgNewTurn,
) => {
  playEffect(AudioActionType.SOUND_NEXT_TURN);
  const context = container.context;
  for (const card of context.cardStore.inner) {
    delete card.confirmedHandCode;
  }
  const player = newTurn.player;
  context.matStore.currentPlayer = player;
  context.matStore.turnCount = context.matStore.turnCount + 1;
  context.historyStore.putTurn(context, player);
  newTurnClock();
};
