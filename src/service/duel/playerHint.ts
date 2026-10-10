import type { PlayerHint } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/playerHint";
import type { Container } from "@/container";
import { duelResultSource } from "@/variant/duelResults";

export default (container: Container, hint: PlayerHint) => {
  if (hint.type !== 6 && hint.type !== 7) return;
  const result = {
    kind:
      hint.type === 6 ? "playerDescriptionAdded" : "playerDescriptionRemoved",
    value: hint.value,
  } as const;
  container.context.historyStore.putResult(
    container.context,
    result,
    hint.player,
    duelResultSource(result),
  );
};
