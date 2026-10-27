import { ygopro } from "@/api";
import { Container } from "@/container";
import { SideStage } from "@/stores";
export function handleChangeSide(
  container: Container,
  _: ygopro.StocChangeSide,
) {
  const side = container.context.sideStore;
  if (
    side.stage !== SideStage.SIDE_CHANGING &&
    side.stage !== SideStage.SIDE_CHANGED
  )
    side.editor = undefined;
  side.stage = SideStage.SIDE_CHANGING;
}
