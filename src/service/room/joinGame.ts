import { sendChat, ygopro } from "@/api";
import { Container } from "@/container";
import { getLanguage, serverLanguageCommand } from "@/variant";
import { connectionStore } from "@/variant/connection";

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
  sendChat(container.conn, serverLanguageCommand(getLanguage()));
}
