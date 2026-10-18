import { ygopro } from "@/api";
import { Container } from "@/container";
import { displaySelectActionsModal } from "@/ui/Duel/Message/SelectActionsModal";

import { fetchCheckCardMeta } from "../utils";
type MsgSelectTribute = ygopro.StocGameMessage.MsgSelectTribute;

export default async (
  container: Container,
  selectTribute: MsgSelectTribute,
) => {
  const { selecteds, mustSelects, selectables } = await fetchCheckCardMeta(
    container.context,
    selectTribute.selectable_cards.map(
      ({ code, location, level, response }) => ({
        code,
        location,
        level1: level,
        response,
      }),
    ),
  );
  // min 限制祭品值总和（level = release_param），max 限制实际选择张数。
  await displaySelectActionsModal({
    cancelable: selectTribute.cancelable,
    overflow: true,
    totalLevels: selectTribute.min,
    min: Math.min(selectTribute.min, 1),
    max: selectTribute.max,
    selecteds,
    mustSelects,
    selectables,
  });
};
