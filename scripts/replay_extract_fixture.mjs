// Owned synthetic replay body for extraction boundaries; no duel is required.
export function extractionFixture(
  zones = [[999999999, 123, 999999999], [456, 321], [42], [77]],
) {
  const body = Buffer.alloc(96 + 4 * 4 + zones.flat().length * 4);
  Buffer.from("Alpha$private", "utf16le").copy(body, 0);
  Buffer.from("Beta", "utf16le").copy(body, 40);
  [8000, 5, 1, 0].forEach((n, i) => body.writeUInt32LE(n, 80 + i * 4));
  let offset = 96;
  for (const zone of zones) {
    body.writeUInt32LE(zone.length, offset);
    offset += 4;
    for (const code of zone) {
      body.writeUInt32LE(code, offset);
      offset += 4;
    }
  }
  const header = Buffer.alloc(80);
  header.writeUInt32LE(0x32707279, 0);
  header.writeUInt32LE(0x1362, 4);
  header.writeUInt32LE(16, 8);
  header.writeUInt32LE(body.length, 16);
  header.writeUInt32LE(1, 64);
  return Buffer.concat([header, body]);
}
