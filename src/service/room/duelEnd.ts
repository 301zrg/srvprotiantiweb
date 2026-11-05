import { ygopro } from "@/api";
import { Container } from "@/container";
import { forgetSavedHistory } from "@/variant/historyResume";

export default function handleDuelEnd(
  container: Container,
  _pb: ygopro.YgoStocMsg,
) {
  container.context.matStore.duelEnd = true;
  forgetSavedHistory();
}
