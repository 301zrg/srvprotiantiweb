import { fetchStrings, Region, ygopro } from "@/api";
import { displayEndModal } from "@/ui/Duel/Message";
import MsgWin = ygopro.StocGameMessage.MsgWin;
import { Container } from "@/container";
import { AudioActionType, changeScene } from "@/infra/audio";
import { SideStage } from "@/stores";

import { isObserver } from "./catchUp";

export default async (container: Container, win: MsgWin) => {
  const context = container.context;
  const { win_player, reason } = win;

  if (isObserver(container)) {
    // A historical result must not wait for a spectator to dismiss a player
    // dialog before we can reach the current game. Live results are hints too.
    context.matStore.hint.msg = fetchStrings(
      Region.Victory,
      `0x${reason.toString(16)}`,
    );
    return;
  }

  const inSide =
    context.sideStore.stage !== SideStage.NONE &&
    context.sideStore.stage !== SideStage.DUEL_START;
  // Between games the mat has been reset, and Core restores the original
  // room seats. A terminal Side result therefore uses the room identity.
  const isWin = inSide
    ? context.roomStore.selfType - 1 === win_player
    : context.matStore.isMe(win_player);
  await displayEndModal(
    isWin,
    fetchStrings(Region.Victory, `0x${reason.toString(16)}`),
  );

  if (isWin) {
    changeScene(AudioActionType.BGM_WIN);
  } else {
    changeScene(AudioActionType.BGM_LOSE);
  }
};
