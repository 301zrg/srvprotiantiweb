import { ygopro } from "@/api";
import MsgPosChange = ygopro.StocGameMessage.MsgPosChange;
import { Container } from "@/container";
import { callCardMove } from "@/ui/Duel/PlayMat/Card";

import { clearOnlineCardTargets } from "./cardRelation";
import { fetchEsHintMeta } from "./util";

export default async (container: Container, posChange: MsgPosChange) => {
  const context = container.context;
  const { location, controller, sequence } = posChange.card_info;

  const target = context.cardStore.at(location, controller, sequence);
  if (target) {
    if (
      [
        ygopro.CardPosition.FACEUP_ATTACK,
        ygopro.CardPosition.FACEUP_DEFENSE,
        ygopro.CardPosition.FACEUP,
      ].includes(posChange.pre_position) &&
      [
        ygopro.CardPosition.FACEDOWN_ATTACK,
        ygopro.CardPosition.FACEDOWN_DEFENSE,
        ygopro.CardPosition.FACEDOWN,
      ].includes(posChange.cur_position)
    ) {
      target.counters = {};
      clearOnlineCardTargets(context.cardStore, target.uuid);
    }
    target.location.position = posChange.cur_position;

    // TODO: 暂时用`Move`动画，后续可以单独实现一个改变表示形式的动画
    await callCardMove(target.uuid);
  } else {
    console.warn(`<PosChange>target from ${posChange.card_info} is null`);
  }

  fetchEsHintMeta({
    context,
    originMsg: 1600,
  });
};
