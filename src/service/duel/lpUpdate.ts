import { ygopro } from "@/api";
import { Container } from "@/container";
import { HistoryOp } from "@/stores";

export default (
  container: Container,
  lpUpdate: ygopro.StocGameMessage.MsgLpUpdate,
) => {
  const player = lpUpdate.player;
  const newLp = lpUpdate.new_lp;
  container.context.matStore.initInfo.of(player).life = newLp;
  container.context.historyStore.putLp(
    container.context,
    player,
    HistoryOp.LP,
    newLp,
  );
};
