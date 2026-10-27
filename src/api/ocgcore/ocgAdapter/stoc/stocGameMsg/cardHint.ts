import { ygopro } from "../../../idl/ocgcore";
import { BufferReaderExt } from "../../bufferIO";

export interface CardHint {
  location: ygopro.CardLocation;
  type: number;
  value: number;
}

// The pinned upstream protobuf has no MSG_CARD_HINT. This local adapter
// extension retains the native payload without modifying that dependency or
// inventing a new wire protocol; online messages are not protobuf-serialized.
export class CardHintGameMessage extends ygopro.StocGameMessage {
  constructor(public cardHint: CardHint) {
    super({});
  }
}

export default (data: Uint8Array) => {
  const reader = new BufferReaderExt(data);
  return new CardHintGameMessage({
    location: reader.readCardLocation(),
    type: reader.inner.readUint8(),
    value: reader.inner.readInt32(),
  });
};
