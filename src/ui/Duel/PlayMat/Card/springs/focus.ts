import { ygopro } from "@/api";
import { waitForDuelDelay } from "@/service/duel/presentation";
import { type CardType, matStore } from "@/stores";

import type { FocusOptions, SpringApi } from "./types";
import { asyncStart } from "./utils";

/** 发动效果的动画 */
export const focus = async (props: {
  card: CardType;
  api: SpringApi;
  options?: FocusOptions;
}) => {
  const { card, api, options } = props;
  if (
    card.location.zone === ygopro.CardZone.HAND ||
    card.location.zone === ygopro.CardZone.DECK ||
    card.location.zone === ygopro.CardZone.EXTRA
  ) {
    const current = { ...api.current[0].get() };
    await asyncStart(api)({
      y: current.y + (matStore.isMe(card.location.controller) ? -1 : 1) * 120, // TODO: 放到config之中
      ry: 0,
      // rz: 0,
      z: current.z + 50,
    });
    if (options?.holdMs) await waitForDuelDelay(options.holdMs, options.signal);
    await asyncStart(api)(current);
  } else {
    await asyncStart(api)({
      focusScale: 1.5,
      focusDisplay: "block",
      focusOpacity: 0,
    });
    api.set({ focusScale: 1, focusOpacity: 1, focusDisplay: "none" });
  }
};
