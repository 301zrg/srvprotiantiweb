import type { RandomRpsMode } from "@/stores/settingStore";

export type RpsHand = 1 | 2 | 3;

/** One server request; neither displaying nor suggesting sends a response. */
export class RpsRequest {
  private sequence = 0;
  private pending?: {
    id: number;
    owner: object;
    epoch: number;
    mode: RandomRpsMode;
  };

  begin(owner: object, epoch: number, mode: RandomRpsMode) {
    const id = ++this.sequence;
    this.pending = { id, owner, epoch, mode };
    return id;
  }

  invalidate() {
    this.pending = undefined;
  }

  private current(
    id: number,
    owner: object,
    epoch: number,
    mode: RandomRpsMode,
  ) {
    const pending = this.pending;
    return (
      pending?.id === id &&
      pending.owner === owner &&
      pending.epoch === epoch &&
      pending.mode === mode
    );
  }

  random(
    id: number,
    owner: object,
    epoch: number,
    mode: RandomRpsMode,
    random = Math.random,
  ): RpsHand | undefined {
    if (mode === "off" || !this.current(id, owner, epoch, mode))
      return undefined;
    return (Math.floor(random() * 3) + 1) as RpsHand;
  }

  consume(id: number, owner: object, epoch: number, mode: RandomRpsMode) {
    if (!this.current(id, owner, epoch, mode)) return false;
    this.pending = undefined;
    return true;
  }
}
