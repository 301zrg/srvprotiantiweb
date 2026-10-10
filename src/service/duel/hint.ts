import { fetchCard, ygopro } from "@/api";
import { fetchCommonHintMeta, fetchSelectHintMeta } from "@/stores";
import { getLanguage } from "@/variant";
import { duelResultSource, type ValueResultKind } from "@/variant/duelResults";
import { mobileMessages } from "@/variant/mobileMessages";

import MsgHint = ygopro.StocGameMessage.MsgHint;
import { Container } from "@/container";

import { fetchEsHintMeta } from "./util";

export default async (container: Container, hint: MsgHint) => {
  const kinds: Partial<Record<MsgHint.HintType, ValueResultKind>> = {
    [MsgHint.HintType.HINT_OPSELECTED]: "option",
    [MsgHint.HintType.HINT_RACE]: "race",
    [MsgHint.HintType.HINT_ATTRIB]: "attribute",
    [MsgHint.HintType.HINT_NUMBER]: "number",
    [MsgHint.HintType.HINT_ZONE]: "zone",
    [MsgHint.HintType.HINT_EFFECT]: "effect",
    [MsgHint.HintType.HINT_CARD]: "effect",
    [MsgHint.HintType.HINT_MESSAGE]: "message",
  };
  const kind = kinds[hint.hint_type];
  if (kind) {
    const result = { kind, value: hint.hint_data };
    container.context.historyStore.putResult(
      container.context,
      result,
      hint.player,
      duelResultSource(result),
    );
  }
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
    case MsgHint.HintType.HINT_OPSELECTED:
    case MsgHint.HintType.HINT_RACE:
    case MsgHint.HintType.HINT_ATTRIB:
    case MsgHint.HintType.HINT_NUMBER:
    case MsgHint.HintType.HINT_ZONE:
    case MsgHint.HintType.HINT_EFFECT:
    case MsgHint.HintType.HINT_CARD:
      break;
    default: {
      console.log(`Unhandled hint type ${MsgHint.HintType[hint.hint_type]}`);
    }
  }
};
