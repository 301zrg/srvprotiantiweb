import { ygopro } from "@/api";
import { Container } from "@/container";
import { RoomStage, SideStage } from "@/stores";

export default function handleDuelStart(
  container: Container,
  _pb: ygopro.YgoStocMsg,
) {
  const context = container.context;
  // This packet is also a reconnect/leave prefix. Only a local Side upload,
  // SELECT_TP or MSG_START can advance an existing Side phase.
  if (context.sideStore.stage === SideStage.NONE) {
    context.roomStore.stage = RoomStage.MORA;
  }
}
