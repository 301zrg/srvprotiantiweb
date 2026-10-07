import type { Container } from "@/container";

const pending = new WeakMap<Container, { finish: () => void }>();

/** Wait for the current game's card effects, including a slow route import. */
export function prepareDuelPresentation(container: Container) {
  pending.get(container)?.finish();
  return new Promise<void>((resolve) => {
    const signal = container.conn.signal;
    const entry = {
      finish() {
        signal?.removeEventListener("abort", entry.finish);
        if (pending.get(container) === entry) pending.delete(container);
        resolve();
      },
    };
    pending.set(container, entry);
    signal?.addEventListener("abort", entry.finish, { once: true });
    if (signal?.aborted) entry.finish();
  });
}

export function duelPresentationReady(
  container: Container,
  firstCard?: string,
) {
  if (container.context.cardStore.inner[0]?.uuid === firstCard)
    pending.get(container)?.finish();
}

/** Background tabs keep the historical messages queued until visible again. */
export function waitForDuelForeground(signal?: AbortSignal) {
  if (!document.hidden || signal?.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const onVisibility = () => {
      if (!document.hidden) finish();
    };
    document.addEventListener("visibilitychange", onVisibility);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
