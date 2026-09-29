import { parseHostInfo } from "@/variant/hostInfo";

import { ygopro } from "../../idl/ocgcore";
import { StocAdapter, YgoProPacket } from "../packet";

/*
 * STOC JoinGame
 *
 * @usage - 告知客户端/前端已成功加入房间
 * */
export default class JoinGameAdapter implements StocAdapter {
  packet: YgoProPacket;

  constructor(packet: YgoProPacket) {
    this.packet = packet;
  }

  upcast(): ygopro.YgoStocMsg {
    const info = parseHostInfo(this.packet.exData);
    return new ygopro.YgoStocMsg({
      stoc_join_game: new ygopro.StocJoinGame({
        lflist: info.lflist,
        rule: info.rule,
        mode: info.mode,
        duel_rule: info.duelRule,
        no_check_deck: info.noCheckDeck,
        no_shuffle_deck: info.noShuffleDeck,
        start_lp: info.startLp,
        start_hand: info.startHand,
        draw_count: info.drawCount,
        time_limit: info.timeLimit,
      }),
    });
  }
}
