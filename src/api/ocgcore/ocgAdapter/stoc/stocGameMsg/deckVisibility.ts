import { ygopro } from "../../../idl/ocgcore";

/** Native 706 messages omitted by the pinned internal protobuf schema. */
export class DeckVisibilityGameMessage extends ygopro.StocGameMessage {
  constructor(
    public deckVisibility:
      | { kind: "reverse" }
      | {
          kind: "top";
          player: number;
          offset: number;
          code: number;
          reversed: boolean;
        },
  ) {
    super({});
  }
}

export function deckVisibilityMessage(command: number, bytes: Uint8Array) {
  if (command === 37) return new DeckVisibilityGameMessage({ kind: "reverse" });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raw = view.getUint32(2, true);
  return new DeckVisibilityGameMessage({
    kind: "top",
    player: view.getUint8(0),
    offset: view.getUint8(1),
    code: raw & 0x7fffffff,
    reversed: !!(raw & 0x80000000),
  });
}
