/*
 * Adapter模块的抽象层。
 *
 * */
import type { ygopro } from "../idl/ocgcore";

const littleEndian: boolean = true;
const PACKET_MIN_LEN = 3;

// Ref: https://www.icode9.com/content-1-1341344.html
export class YgoProPacket {
  packetLen: number; // 数据包长度
  proto: number; // ygopro协议标识
  exData: Uint8Array; // 数据包内容

  constructor(packetLen: number, proto: number, exData: Uint8Array) {
    this.packetLen = packetLen;
    this.proto = proto;
    this.exData = exData;
  }

  /*
   * 将[`ygoProPacket`]对象序列化，
   * 返回的二进制数数组可通过长连接发送到ygopro服务端。
   *
   * */
  serialize(): Uint8Array {
    const array = new Uint8Array(this.packetLen + 2);
    const dataView = new DataView(array.buffer);

    dataView.setUint16(0, this.packetLen, littleEndian);
    dataView.setUint8(2, this.proto);
    array.set(this.exData, 3);

    return array;
  }

  /*
   * 将二进制数据反序列化成[`ygoProPacket`]对象，
   * 返回值可用于业务逻辑处理。
   *
   * */
  static deserialize(array: ArrayBuffer): YgoProPacket[] {
    const framer = new YgoProPacketFramer();
    const packets = framer.push(array);
    if (framer.pendingBytes) throw new Error("Incomplete YGOPro packet");
    return packets;
  }
}

/** WebSocket message boundaries are not YGOPro packet boundaries. */
export class YgoProPacketFramer {
  private pending = new Uint8Array(0);

  get pendingBytes(): number {
    return this.pending.length;
  }

  push(chunk: ArrayBuffer): YgoProPacket[] {
    const incoming = new Uint8Array(chunk);
    if (incoming.length > 2 * 1024 * 1024)
      throw new Error("WebSocket message exceeded client limit");
    const data = new Uint8Array(this.pending.length + incoming.length);
    data.set(this.pending);
    data.set(incoming, this.pending.length);
    const packets: YgoProPacket[] = [];
    let offset = 0;
    while (data.length - offset >= PACKET_MIN_LEN) {
      const size = new DataView(
        data.buffer,
        data.byteOffset + offset,
        2,
      ).getUint16(0, littleEndian);
      if (size < 1) throw new Error("Invalid YGOPro packet length");
      const total = size + 2;
      if (data.length - offset < total) break;
      packets.push(
        new YgoProPacket(
          size,
          data[offset + 2],
          data.slice(offset + 3, offset + total),
        ),
      );
      offset += total;
    }
    this.pending = data.slice(offset);
    if (this.pending.length > 65537)
      throw new Error("YGOPro packet buffer exceeded limit");
    return packets;
  }
}

export interface StocAdapter {
  upcast(): ygopro.YgoStocMsg;
}

export interface CtosAdapter {
  readonly protobuf: ygopro.YgoCtosMsg;

  downcast(): YgoProPacket;
}
