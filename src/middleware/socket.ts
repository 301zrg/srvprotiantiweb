/*
 * Socket中间件
 *
 * 所有长连接/Websocket相关的逻辑都应该收敛在这里。
 *
 * */
import { WebSocketStream } from "@/infra";

import handleSocketOpen from "../service/onSocketOpen";

// FIXME: 应该有个返回值，告诉业务方本次请求的结果。比如建立长连接失败。
export function initSocket(initInfo: {
  ip: string;
  player: string;
  passWd: string;
  customOnConnected?: (conn: WebSocketStream) => void;
}): WebSocketStream {
  const { ip, player, passWd, customOnConnected } = initInfo;
  return new WebSocketStream(
    ip,
    (conn, _event) => {
      handleSocketOpen(conn, ip, player, passWd);
      customOnConnected && customOnConnected(conn);
    },
    { room: passWd, nickname: player },
  );
}

export function sendSocketData(conn: WebSocketStream, payload: Uint8Array) {
  // Freeze the last confirmed G1 upload; side-deck uploads must not replace it.
  if (payload[2] === 2 && !conn.duelStarted)
    conn.initialDeckPayload = payload.slice();
  conn.ws.send(payload);
}

export function closeSocket(conn: WebSocketStream) {
  conn.close();
}
