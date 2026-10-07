import type { WebSocketStream } from "@/infra";

// Intent belongs to the connection, so retries and old sockets cannot share it.
const pending = new WeakSet<WebSocketStream>();

export function requestSpectatorSeat(conn: WebSocketStream) {
  pending.add(conn);
}

export function consumeSpectatorSeatRequest(conn: WebSocketStream): boolean {
  return pending.delete(conn);
}
