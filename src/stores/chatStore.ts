import { proxy } from "valtio";

import { ygopro } from "@/api";

import { isMe, matStore } from "./matStore";
import { roomStore } from "./roomStore";
import { type NeosStore } from "./shared";
import { SideStage, sideStore } from "./sideStore";

export interface ChatEntry {
  sender: number;
  message: string;
  time: string;
  /** Sender as a room seat: room, waiting and siding chats. */
  seatName?: string;
  /** Sender in a duel chat, which follows the Core's player order. */
  duelName?: string;
}

export const isServerSender = (sender: number) =>
  sender === 8 || (sender >= 11 && sender <= 19);

function senderName(sender: number, isDuel: boolean) {
  if (sender < 4) {
    // Between games (Side, waiting for Side, first-player choice) the host
    // restores room seats as chat IDs, as in YGOPro's ChatLocalPlayer; a
    // spectator's duel chat stays mounted then and must not swap them.
    const betweenGames =
      sideStore.stage !== SideStage.NONE &&
      sideStore.stage !== SideStage.DUEL_START;
    if (isDuel && !betweenGames) {
      // Like YGOPro's ChatLocalPlayer/OppositePlayer: duel IDs follow Core
      // order; the roster follows room seats. A view flip changes neither.
      const teamBit = roomStore.hostInfo?.mode === 2 ? 2 : 1;
      let swapped = matStore.observerSwapped;
      if (
        matStore.selfType !==
        ygopro.StocGameMessage.MsgStart.PlayerType.Observer
      ) {
        const selfSeat = roomStore.players.findIndex((player) => player?.isMe);
        if (selfSeat < 0) return;
        swapped = (selfSeat & teamBit) !== (isMe(0) ? 0 : teamBit);
      }
      return roomStore.players[sender ^ (swapped ? teamBit : 0)]?.name;
    }
    return roomStore.players[sender]?.name;
  } else if (isServerSender(sender)) {
    return "System";
  }
  // Native STOC_CHAT uses a hidden-name prefix for watchers/unknown sources.
  // SRVPro may already include a watcher nickname in the message body.
  return "********";
}

function currentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export class ChatStore implements NeosStore {
  /**
   * Every line of the room. Lines arrive before a chat mounts (the join
   * messages) and several can arrive in one frame, so nothing may depend on a
   * component seeing each one. Names are resolved now: seats change later.
   */
  entries: ChatEntry[] = [];

  receive(sender: number, message: string) {
    if (sender < 0 || message.length === 0) return;
    this.entries.push({
      sender,
      message,
      time: currentTime(),
      seatName: senderName(sender, false),
      duelName: senderName(sender, true),
    });
  }

  reset(): void {
    this.entries = [];
  }
}

export const chatStore = proxy<ChatStore>(new ChatStore());
