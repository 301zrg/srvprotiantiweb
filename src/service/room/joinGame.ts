import { sendChat, sendHsToObserver, ygopro } from "@/api";
import { Container } from "@/container";
import { getLanguage, serverLanguageCommand } from "@/variant";
import { connectionStore } from "@/variant/connection";
import { consumeSpectatorSeatRequest } from "@/variant/spectatorSession";

export default function handleJoinGame(
  container: Container,
  pb: ygopro.YgoStocMsg,
) {
  const info = pb.stoc_join_game;
  container.context.roomStore.hostInfo = {
    lflist: info.lflist,
    rule: info.rule,
    mode: info.mode,
    duelRule: info.duel_rule,
    noCheckDeck: info.no_check_deck,
    noShuffleDeck: info.no_shuffle_deck,
    startLp: info.start_lp,
    startHand: info.start_hand,
    drawCount: info.draw_count,
    timeLimit: info.time_limit,
  };
  container.context.roomStore.joined = true;
  connectionStore.pendingJoinMessage = "";
  // Wait for JOIN_GAME acknowledgement: the host resolves joins asynchronously.
  // A running room already supplies observer history; its host ignores this.
  if (consumeSpectatorSeatRequest(container.conn))
    sendHsToObserver(container.conn);
  sendChat(container.conn, serverLanguageCommand(getLanguage()));
}
