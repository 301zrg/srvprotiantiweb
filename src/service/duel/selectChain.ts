import { sendSelectSingleResponse, ygopro } from "@/api";
import { Container } from "@/container";
import { ChainSetting, fetchSelectHintMeta } from "@/stores";
import { displaySelectActionsModal } from "@/ui/Duel/Message/SelectActionsModal";

import { fetchCheckCardMeta } from "../utils";

type MsgSelectChain = ygopro.StocGameMessage.MsgSelectChain;
export default async (container: Container, request: MsgSelectChain) => {
  const { context, conn } = container;
  const chains = request.chains;
  const mode = context.matStore.chainSetting;
  const forced =
    request.forced || chains.some((chain) => (chain as any).forced);
  if (
    !forced &&
    (mode === ChainSetting.CHAIN_IGNORE ||
      (mode !== ChainSetting.CHAIN_ALL &&
        (!chains.length || !request.special_count)))
  ) {
    sendSelectSingleResponse(conn, -1);
    return;
  }
  if (forced && chains.length === 1) {
    sendSelectSingleResponse(conn, chains[0].response);
    return;
  }
  fetchSelectHintMeta({ selectHintData: 203 });
  const options = await fetchCheckCardMeta(context, chains);
  await displaySelectActionsModal({
    isChain: true,
    chainContext: {
      source: context.matStore.hint.esHintSource,
      hint0: request.hint0,
      hint1: request.hint1,
    },
    cancelable: !forced,
    min: 1,
    max: 1,
    ...options,
  });
};
