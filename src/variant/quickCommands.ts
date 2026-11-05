import { proxy } from "valtio";

import { sendChat } from "@/api";
import { type WebSocketStream } from "@/infra";

/**
 * Chat shortcuts answered by the host without reaching other players. A button
 * stays locked from the click until a reply reaches the socket, so a reply that
 * never comes is visible to the player. There is deliberately no timeout: a new
 * connection clears the lock, and judging the network is left to the player.
 */
export const quickCommands = {
  tip: { text: "/tip", replyPlayer: 8 },
  roomname: { text: "/roomname", replyPlayer: 14 },
} as const;

export type QuickCommand = keyof typeof quickCommands;

export const quickCommandStore = proxy<Record<QuickCommand, boolean>>({
  tip: false,
  roomname: false,
});

let active: WebSocketStream | undefined;

export function resetQuickCommands(conn: WebSocketStream) {
  active = conn;
  quickCommandStore.tip = false;
  quickCommandStore.roomname = false;
}

export function sendQuickCommand(conn: WebSocketStream, command: QuickCommand) {
  if (active !== conn) resetQuickCommands(conn);
  if (quickCommandStore[command]) return;
  quickCommandStore[command] = true;
  // A closed socket would drop this silently; it stays locked until a reconnect.
  if (conn.ws.readyState === WebSocket.OPEN)
    sendChat(conn, quickCommands[command].text);
}

/** Called at network arrival: an open prompt can hold the chat line in the queue. */
export function noteChatArrival(conn: WebSocketStream, payload: Uint8Array) {
  if (conn !== active || payload.length < 2) return;
  const player = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getInt16(0, true);
  for (const command of Object.keys(quickCommands) as QuickCommand[])
    if (quickCommands[command].replyPlayer === player)
      quickCommandStore[command] = false;
}
