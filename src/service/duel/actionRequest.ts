import { type Container } from "@/container";
import { isUIContainer } from "@/container/compat";

interface Request {
  source: "idle" | "battle";
  cancellation: AbortController;
  busy: boolean;
  submitted: boolean;
}
const requests = new WeakMap<Container, Request>();

/** A new Core question invalidates drafts for the previous active command. */
export function invalidateActionRequest(container: Container) {
  requests.get(container)?.cancellation.abort();
  requests.delete(container);
  const phase = container.context?.matStore?.phase;
  if (phase) {
    phase.command = undefined;
    phase.enableBp = phase.enableM2 = phase.enableEp = false;
    phase.enableShuffle = false;
  }
}

export function beginActionRequest(
  container: Container,
  source: "idle" | "battle" = "idle",
) {
  invalidateActionRequest(container);
  requests.set(container, {
    source,
    cancellation: new AbortController(),
    busy: false,
    submitted: false,
  });
  if (container.context?.matStore?.phase)
    container.context.matStore.phase.command = source;
}

/** Covers both candidate windows and confirmation, including repeated taps. */
export function claimActionRequest(container: Container) {
  const request = requests.get(container);
  const conn = container.conn;
  if (!request || request.busy || request.submitted) return;
  const valid = () =>
    requests.get(container) === request &&
    container.conn === conn &&
    !request.cancellation.signal.aborted &&
    !conn.signal.aborted &&
    conn.ws.readyState === 1 &&
    !conn.endedRoom &&
    !conn.resuming &&
    isUIContainer(container);
  if (!valid()) return;
  request.busy = true;
  const abort = () => request.cancellation.abort();
  conn.signal.addEventListener("abort", abort, { once: true });
  conn.ws.addEventListener?.("close", abort, { once: true });
  return {
    source: request.source,
    signal: request.cancellation.signal,
    valid,
    submit(send: () => void) {
      if (!valid() || request.submitted) return false;
      // Consume before dispatch so a second tap cannot send a second response.
      request.submitted = true;
      if (container.context?.matStore?.phase)
        container.context.matStore.phase.command = undefined;
      send();
      return true;
    },
    release() {
      request.busy = false;
      conn.signal.removeEventListener("abort", abort);
      conn.ws.removeEventListener?.("close", abort);
    },
  };
}

export type ActionLease = NonNullable<ReturnType<typeof claimActionRequest>>;
