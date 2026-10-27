import type { YgoProPacket } from "@/api/ocgcore/ocgAdapter/packet";
import {
  MSG_START,
  STOC_CHANGE_SIDE,
  STOC_DUEL_END,
  STOC_GAME_MSG,
  STOC_JOIN_GAME,
  STOC_TIME_LIMIT,
  STOC_TYPE_CHANGE,
} from "@/api/ocgcore/ocgAdapter/protoDecl";

/** Connection acknowledgements must not wait for presentation or user input. */
export class ConnectionControl {
  private player = false;
  private controller = 0;
  private mode = 0;

  get confirmsTimeLimitsOnArrival() {
    // Full Tag turn/teammate rotation is not implemented by this client.
    return this.mode !== 2;
  }

  receive(packet: YgoProPacket): boolean {
    const data = packet.exData;
    if (packet.proto === STOC_JOIN_GAME && data.length >= 20)
      this.mode = data[5];
    if (packet.proto === STOC_TYPE_CHANGE && data.length >= 1) {
      const seat = data[0] & 0xf;
      this.player = seat < 4;
      this.controller = 0;
    }
    if (
      packet.proto === STOC_GAME_MSG &&
      data[0] === MSG_START &&
      data.length >= 18
    ) {
      const type = data[1];
      this.player = (type & 0xf0) === 0 && (type & 0xf) < 2;
      this.controller = type & 0xf;
    }
    if (packet.proto === STOC_CHANGE_SIDE) this.controller = 0;
    if (packet.proto === STOC_DUEL_END) this.player = false;
    return (
      this.confirmsTimeLimitsOnArrival &&
      this.player &&
      packet.proto === STOC_TIME_LIMIT &&
      data.length === 4 &&
      data[0] === this.controller
    );
  }
}
