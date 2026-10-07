import { fetchCard, ygopro } from "@/api";
import { fetchCommonHintMeta, fetchSelectHintMeta } from "@/stores";
import { getLanguage } from "@/variant";
import { mobileMessages } from "@/variant/mobileMessages";

import MsgHint = ygopro.StocGameMessage.MsgHint;
import { Container } from "@/container";

import { fetchEsHintMeta } from "./util";

export default async (container: Container, hint: MsgHint) => {
  switch (hint.hint_type) {
    case MsgHint.HintType.HINT_CODE: {
      const meta = fetchCard(hint.hint_data);
      container.context.historyStore.putAnnounce(
        container.context,
        hint.hint_data,
        hint.player,
      );
      container.context.matStore.hint.msg = `${
        mobileMessages(getLanguage()).declaredCard
      }: ${meta.text.name ?? hint.hint_data}`;
      break;
    }
    case MsgHint.HintType.HINT_EVENT: {
      await fetchEsHintMeta({
        context: container.context,
        originMsg: hint.hint_data,
      });
      break;
    }
    case MsgHint.HintType.HINT_MESSAGE: {
      fetchCommonHintMeta(hint.hint_data);
      break;
    }
    case MsgHint.HintType.HINT_SELECTMSG: {
      fetchSelectHintMeta({
        selectHintData: hint.hint_data,
        esHint: "",
      });
      break;
    }
    default: {
      console.log(`Unhandled hint type ${MsgHint.HintType[hint.hint_type]}`);
    }
  }
};
