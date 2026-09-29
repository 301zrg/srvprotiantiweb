import assert from "node:assert/strict";

import { YgoProPacket, YgoProPacketFramer } from "../src/api/ocgcore/ocgAdapter/packet.ts";
import { parseHostInfo } from "../src/variant/hostInfo.ts";

const frame = (protocol, bytes) => {
  const packet = new YgoProPacket(bytes.length + 1, protocol, Uint8Array.from(bytes));
  return packet.serialize();
};

const first = frame(0x7f, [1, 2]);
const second = frame(0x80, [3, 4, 5]);
const third = frame(0x81, Array(33000).fill(7));
const joined = Uint8Array.from([...first, ...second, ...third]);

const framer = new YgoProPacketFramer();
assert.equal(framer.push(joined.slice(0, 1).buffer).length, 0);
assert.equal(framer.push(joined.slice(1, 4).buffer).length, 0);
const packets = framer.push(joined.slice(4).buffer);
assert.deepEqual(packets.map((packet) => packet.proto), [0x7f, 0x80, 0x81]);
assert.equal(packets[2].exData.length, 33000);
assert.equal(framer.pendingBytes, 0);
assert.throws(() => YgoProPacket.deserialize(first.slice(0, 2).buffer), /Incomplete/);
assert.throws(() => new YgoProPacketFramer().push(Uint8Array.of(0, 0, 1).buffer), /Invalid/);

const hostBytes = new Uint8Array(20);
const hostView = new DataView(hostBytes.buffer);
hostView.setUint32(0, 0x73ec4051, true);
hostView.setUint8(4, 1);
hostView.setUint8(5, 1);
hostView.setUint8(6, 2);
hostView.setInt32(12, 8000, true);
hostView.setUint8(16, 5);
hostView.setUint8(17, 1);
hostView.setUint16(18, 180, true);
assert.deepEqual(parseHostInfo(hostBytes), {
  lflist: 0x73ec4051, rule: 1, mode: 1, duelRule: 2,
  noCheckDeck: false, noShuffleDeck: false,
  startLp: 8000, startHand: 5, drawCount: 1, timeLimit: 180,
});
assert.throws(() => parseHostInfo(new Uint8Array(19)), /incomplete/);

console.log("YGOPro packet framing and HostInfo parsing passed");
