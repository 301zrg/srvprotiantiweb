import { type SpringConfig, type SpringRef } from "@react-spring/web";

import { getUIContainer } from "@/container/compat";
import { waitForDuelForeground } from "@/service/duel/presentation";
import { settingStore } from "@/stores/settingStore";

export const asyncStart = <T extends {}>(
  api: SpringRef<T>,
  signal = getUIContainer().conn.signal,
) => {
  return async (p: Partial<T> & { config?: SpringConfig }) => {
    await waitForDuelForeground(signal);
    if (signal?.aborted) return;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        signal?.removeEventListener("abort", onAbort);
      };
      const finish = (snap: boolean, stop = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          if (snap || stop) api.stop(true);
          if (snap && !signal?.aborted) {
            const { config: _config, ...values } = p;
            api.set(values as Partial<T>);
          }
          resolve();
        } catch (error) {
          // A failed fallback must reject to the transport's error boundary,
          // never leave the serial consumer waiting on an unsettled Promise.
          reject(error);
        }
      };
      const onFailure = () => {
        if (settled) return;
        if (import.meta.env.DEV)
          console.warn("Card animation failed; applying its final state.");
        finish(true);
      };
      const onVisibility = () => {
        clearTimeout(timer);
        try {
          if (document.hidden) api.pause();
          else {
            api.resume();
            timer = setTimeout(() => finish(true), 3000);
          }
        } catch {
          onFailure();
        }
      };
      const onAbort = () => finish(false, true);
      // Only a stalled foreground animation gets a deadline. Message backlog
      // and background suspension never fast-forward spectator history.
      timer = setTimeout(() => finish(true), 3000);
      document.addEventListener("visibilitychange", onVisibility);
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        void Promise.all(api.start(p)).then(() => finish(false), onFailure);
      } catch {
        onFailure();
      }
    });
  };
};

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
