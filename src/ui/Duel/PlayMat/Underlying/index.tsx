import { useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { isMe, matStore } from "@/stores";
import { DuelBackground } from "@/ui/Shared/DuelShell/DuelBackground";

/** Online backdrop: near is the viewer's side (or the spectator's view). */
export const Underlying: React.FC = () => {
  const { currentPlayer, selfType, observerView } = useSnapshot(matStore);
  const near =
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer
      ? currentPlayer === observerView
      : isMe(currentPlayer);
  return <DuelBackground near={near} />;
};
