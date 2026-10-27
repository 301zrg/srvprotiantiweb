import { ygopro } from "../../../idl/ocgcore";
import { BufferReaderExt } from "../../bufferIO";

export interface CardRelationEvent {
  kind: "equip" | "unequip" | "target" | "untarget";
  source: ygopro.CardLocation;
  target?: ygopro.CardLocation;
}

/** Native 706 messages omitted by the pinned internal protobuf schema. */
export class CardRelationGameMessage extends ygopro.StocGameMessage {
  constructor(public relation: CardRelationEvent) {
    super({});
  }
}

export function cardRelationMessage(command: number, bytes: Uint8Array) {
  const reader = new BufferReaderExt(bytes);
  return new CardRelationGameMessage({
    kind:
      command === 93
        ? "equip"
        : command === 95
        ? "unequip"
        : command === 96
        ? "target"
        : "untarget",
    source: reader.readCardLocation(),
    target: command === 95 ? undefined : reader.readCardLocation(),
  });
}
