import { getStrings, ygopro } from "@/api";
import type { Container } from "@/container";
import { displayYesNoModal } from "@/ui/Duel/Message";
import { duelResultSource } from "@/variant/duelResults";

type MsgSelectYesNo = ygopro.StocGameMessage.MsgSelectYesNo;

export default async (container: Container, selectYesNo: MsgSelectYesNo) => {
  const effect_description = selectYesNo.effect_description;

  const msg = getStrings(effect_description);
  const accepted = await displayYesNoModal(msg);
  const result = {
    kind: "yesNo",
    value: effect_description,
    accepted,
  } as const;
  container.context.historyStore.putResult(
    container.context,
    result,
    selectYesNo.player,
    duelResultSource(result),
    "response",
  );
};
