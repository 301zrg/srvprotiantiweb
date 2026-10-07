import { ygopro } from "@/api";
import { Container } from "@/container";

export default function handleHsPlayerChange(
  container: Container,
  pb: ygopro.YgoStocMsg,
) {
  const change = pb.stoc_hs_player_change;
  const context = container.context;

  if (change.pos < 0 || change.pos >= 4) {
    return;
  } else {
    switch (change.state) {
      case ygopro.StocHsPlayerChange.State.UNKNOWN: {
        console.log("Unknown HsPlayerChange State");

        break;
      }
      case ygopro.StocHsPlayerChange.State.MOVE: {
        if (
          change.moved_pos < 0 ||
          change.moved_pos >= 4 ||
          change.moved_pos === change.pos
        )
          break;
        console.info(
          "<HsPlayerChange>Player " +
            change.pos +
            " moved to " +
            change.moved_pos,
        );
        context.roomStore.players[change.moved_pos] =
          context.roomStore.players[change.pos];
        context.roomStore.players[change.pos] = undefined;
        break;
      }
      case ygopro.StocHsPlayerChange.State.READY:
      case ygopro.StocHsPlayerChange.State.NO_READY: {
        const player = context.roomStore.players[change.pos];
        if (player) {
          player.state = change.state;
        }
        break;
      }
      case ygopro.StocHsPlayerChange.State.LEAVE: {
        context.roomStore.players[change.pos] = undefined;
        break;
      }
      case ygopro.StocHsPlayerChange.State.TO_OBSERVER: {
        context.roomStore.players[change.pos] = undefined;
        context.roomStore.observerCount += 1;
        break;
      }
      default: {
        break;
      }
    }
  }
}
