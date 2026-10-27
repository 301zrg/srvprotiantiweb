import { type CardHint } from "@/api/ocgcore/ocgAdapter/stoc/stocGameMsg/cardHint";
import { Container } from "@/container";
import type { ValueResultKind } from "@/variant/duelResults";

export default (container: Container, hint: CardHint) => {
  const card = container.context.cardStore.find(hint.location);
  // Description hints do not replace the persistent declaration on the card.
  const kinds: Record<number, ValueResultKind> = {
    1: "turn",
    2: "card",
    3: "race",
    4: "attribute",
    5: "number",
    6: "cardDescriptionAdded",
    7: "cardDescriptionRemoved",
  };
  const kind = kinds[hint.type];
  const description = hint.type === 6 || hint.type === 7;
  if (
    kind &&
    (description ||
      (hint.value !== 0 &&
        (card?.hint?.type !== hint.type || card.hint.value !== hint.value)))
  ) {
    container.context.historyStore.putResult(
      container.context,
      { kind, value: hint.value },
      hint.location.controller,
      card?.code ?? 0,
    );
  }
  if (!card || description) return;
  card.hint =
    hint.type > 0 && hint.value !== 0
      ? { type: hint.type, value: hint.value }
      : undefined;
};
