import { BufferReader } from "@/infra";

import { ygopro } from "../../idl/ocgcore";
import { StocAdapter, YgoProPacket } from "../packet";

/*
 * STOC HandResult
 *
 * @usage - 后端告诉前端玩家们的猜拳选择
 * */
export default class SelectHand implements StocAdapter {
  packet: YgoProPacket;

  constructor(packet: YgoProPacket) {
    this.packet = packet;
  }

  upcast(): ygopro.YgoStocMsg {
    const reader = new BufferReader(this.packet.exData);
    // YGOPro Core uses 1=scissors, 2=rock, 3=paper, while the
    // generated Neos HandType enum uses 1=rock, 2=scissors, 3=paper.
    const toHandType = (value: number): ygopro.HandType => {
      switch (value) {
        case 1:
          return ygopro.HandType.SCISSORS;
        case 2:
          return ygopro.HandType.ROCK;
        case 3:
          return ygopro.HandType.PAPER;
        default:
          return ygopro.HandType.UNKNOWN;
      }
    };
    const meResult = toHandType(reader.readUint8());
    const opResult = toHandType(reader.readUint8());
    return new ygopro.YgoStocMsg({
      stoc_hand_result: new ygopro.StocHandResult({
        meResult,
        opResult,
      }),
    });
  }
}
