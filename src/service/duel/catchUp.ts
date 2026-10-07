import { ygopro } from "@/api";
import type { Container } from "@/container";

// This is incoming spectator history, not a locally simulated replay.
export const isObserver = (container: Container) =>
  container.context.roomStore.selfType ===
    ygopro.StocTypeChange.SelfType.OBSERVER ||
  container.context.matStore.selfType ===
    ygopro.StocGameMessage.MsgStart.PlayerType.Observer;

export const shouldSkipDuelAnimation = (container: Container) =>
  document.hidden ||
  (isObserver(container) &&
    (container.conn.pendingMessages ?? 0) +
      (container.conn.pendingPackets ?? 0) >
      0);
