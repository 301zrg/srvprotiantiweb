import { ygopro } from "@/api";
import { Container } from "@/container";
import { SideStage } from "@/stores";
export function handleWaitingSide(
  container: Container,
  _: ygopro.StocWaitingSide,
) {
  // WAITING_SIDE belongs to spectators; it must not close a player's editor.
  if (
    container.context.roomStore.selfType ===
    ygopro.StocTypeChange.SelfType.OBSERVER
  )
    container.context.sideStore.stage = SideStage.WAITING;
}
