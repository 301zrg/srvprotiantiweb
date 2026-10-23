import { ygopro } from "@/api";
import { Container } from "@/container";
import { notifyRpsResult } from "@/service/mora/feedback";

export default function handResult(
  container: Container,
  pb: ygopro.YgoStocMsg,
) {
  const msg = pb.stoc_hand_result;
  const context = container.context;
  const me = context.roomStore.getMePlayer();
  const op = context.roomStore.getOpPlayer();

  if (me && op) {
    me.moraResult = msg.meResult;
    op.moraResult = msg.opResult;
    if (context.roomStore.selfType !== ygopro.StocTypeChange.SelfType.OBSERVER)
      // The room adapter has already converted native hands to HandType.
      notifyRpsResult(
        msg.meResult === ygopro.HandType.ROCK
          ? 2
          : msg.meResult === ygopro.HandType.SCISSORS
          ? 1
          : msg.meResult,
        msg.opResult === ygopro.HandType.ROCK
          ? 2
          : msg.opResult === ygopro.HandType.SCISSORS
          ? 1
          : msg.opResult,
      );
  } else if (
    context.roomStore.selfType !== ygopro.StocTypeChange.SelfType.OBSERVER
  ) {
    console.error("<HandResult>me or op is undefined");
  }
}
