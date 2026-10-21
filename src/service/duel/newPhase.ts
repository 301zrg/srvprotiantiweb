import { ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { isBattleHint, onlinePhaseHint } from "@/variant/duelTiming";

import { fetchEsHintMeta } from "./util";

export default (
  container: Container,
  newPhase: ygopro.StocGameMessage.MsgNewPhase,
) => {
  playEffect(AudioActionType.SOUND_PHASE);
  // ts本身还没有这么智能，所以需要手动指定类型
  container.context.matStore.phase.currentPhase = newPhase.phase_type;
  const hint = onlinePhaseHint(newPhase.phase_type);
  container.context.matStore.phase.battleTiming =
    hint && isBattleHint(hint) ? hint : undefined;
  if (hint) fetchEsHintMeta({ context: container.context, originMsg: hint });
};
