import { type SpringConfig, type SpringRef } from "@react-spring/web";

import { getUIContainer } from "@/container/compat";
import { shouldSkipDuelAnimation } from "@/service/duel/catchUp";
import { settingStore } from "@/stores/settingStore";

export const asyncStart = <T extends {}>(api: SpringRef<T>) => {
  return (p: Partial<T> & { config?: SpringConfig }) =>
    new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisibility);
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
        if (document.hidden) finish(true);
      };
      if (shouldSkipDuelAnimation(getUIContainer())) {
        finish(true);
        return;
      }
      // Safari may suspend frame callbacks on tab/app switches. Presentation
      // must never keep the ordered network queue waiting indefinitely.
      timer = setTimeout(() => finish(true), 3000);
      document.addEventListener("visibilitychange", onVisibility);
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

export function getDuration(): number {
  const MAX_DURATION = 400;
  const { speed } = settingStore.animation;

  return MAX_DURATION - speed * 300;
}
