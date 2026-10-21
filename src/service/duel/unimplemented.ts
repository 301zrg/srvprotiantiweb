import { ygopro } from "@/api";
import { Container } from "@/container";

import { fetchEsHintMeta } from "./util";

const UNIMPLEMENTED_WHITE_LIST = [
  1, 6, 7, 34, 54, 55, 56, 60, 61, 62, 63, 64, 65, 70, 71, 72, 73, 74, 75, 76,
  80, 81, 83, 93, 95, 96, 97, 101, 102, 110, 111, 112, 113, 114, 120, 121, 122,
  123, 130, 131, 132, 133, 160, 161, 163, 164, 165, 170, 180, 230, 231, 236,
];

export default (
  container: Container,
  unimplemented: ygopro.StocGameMessage.MsgUnimplemented,
) => {
  // The pinned protobuf omits these payload-free native battle messages.
  if (unimplemented.command === 113 || unimplemented.command === 114) {
    const timing = unimplemented.command === 113 ? 40 : 24;
    container.context.matStore.phase.battleTiming = timing;
    fetchEsHintMeta({ context: container.context, originMsg: timing });
    return;
  }
  if (!UNIMPLEMENTED_WHITE_LIST.includes(unimplemented.command)) {
    container.context.matStore.unimplemented = unimplemented.command;
  }
};
