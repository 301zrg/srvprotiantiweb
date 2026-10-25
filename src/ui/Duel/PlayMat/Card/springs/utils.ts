import { type SpringConfig, type SpringRef } from "@react-spring/web";

import { getUIContainer } from "@/container/compat";
import { waitForDuelForeground } from "@/service/duel/presentation";
import { settingStore } from "@/stores/settingStore";

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return async (p: Partial<T> & { config?: SpringConfig }) => {
    const signal = getUIContainer().conn.signal;
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
      const finish = (snap: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (snap) {
          api.stop(true);
          const { config: _config, ...values } = p;
          api.set(values as Partial<T>);
        }
        resolve();
      };
      const onVisibility = () => {
        clearTimeout(timer);
        if (document.hidden) api.pause();
        else {
          api.resume();
          timer = setTimeout(() => finish(true), 3000);
        }
      };
      const onAbort = () => {
        api.stop(true);
        finish(false);
      };
      // Only a stalled foreground animation gets a deadline. Message backlog
      // and background suspension never fast-forward spectator history.
      timer = setTimeout(() => finish(true), 3000);
      document.addEventListener("visibilitychange", onVisibility);
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        void Promise.all(
          api.start({ ...p, onResolve: () => finish(false) }),
        ).then(
          () => finish(false),
          (error) => {
            settled = true;
            cleanup();
            reject(error);
          },
        );
      } catch (error) {
        settled = true;
        cleanup();
        reject(error);
      }
    });
  };
};

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
