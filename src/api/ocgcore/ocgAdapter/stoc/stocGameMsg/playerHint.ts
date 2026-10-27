import { BufferReader } from "@/infra";

import { ygopro } from "../../../idl/ocgcore";

export interface PlayerHint {
  player: number;
  type: number;
  value: number;
}

// Local extension for the native MSG_PLAYER_HINT absent from the pinned IDL.
export class PlayerHintGameMessage extends ygopro.StocGameMessage {
  constructor(public playerHint: PlayerHint) {
    super({});
  }
}

export default (data: Uint8Array) => {
  const reader = new BufferReader(data);
  return new PlayerHintGameMessage({
    player: reader.readUint8(),
    type: reader.readUint8(),
    value: reader.readUint32(),
  });
};
