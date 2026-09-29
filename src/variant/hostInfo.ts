export interface HostInfo {
  lflist: number;
  rule: number;
  mode: number;
  duelRule: number;
  noCheckDeck: boolean;
  noShuffleDeck: boolean;
  startLp: number;
  startHand: number;
  drawCount: number;
  timeLimit: number;
}

export function parseHostInfo(bytes: Uint8Array): HostInfo {
  if (bytes.length < 20)
    throw new Error("STOC_JOIN_GAME has incomplete HostInfo");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    lflist: view.getUint32(0, true),
    rule: view.getUint8(4),
    mode: view.getUint8(5),
    duelRule: view.getUint8(6),
    noCheckDeck: view.getUint8(7) !== 0,
    noShuffleDeck: view.getUint8(8) !== 0,
    startLp: view.getInt32(12, true),
    startHand: view.getUint8(16),
    drawCount: view.getUint8(17),
    timeLimit: view.getUint16(18, true),
  };
}
