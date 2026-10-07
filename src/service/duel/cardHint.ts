import { type CardHint } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/cardHint";
import { Container } from "@/container";

export default (container: Container, hint: CardHint) => {
  const card = container.context.cardStore.find(hint.location);
  if (!card) return;
  // Description reference counts (6/7) are separate from CHINT_CARD etc.
  if (hint.type === 6 || hint.type === 7) return;
  card.hint =
    hint.type > 0 && hint.value !== 0
      ? { type: hint.type, value: hint.value }
      : undefined;
};
