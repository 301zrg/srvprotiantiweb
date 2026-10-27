import { ygopro } from "@/api";
import { type CardType, matStore } from "@/stores";

import type { SpringApi } from "./types";
import { asyncStart } from "./utils";

/** 发动效果的动画 */
export const focus = async (props: {
  card: CardType;
  api: SpringApi;
  signal?: AbortSignal;
}) => {
  const { card, api, signal } = props;
  if (
    card.location.zone === ygopro.CardZone.HAND ||
    card.location.zone === ygopro.CardZone.DECK ||
    card.location.zone === ygopro.CardZone.EXTRA
  ) {
    const current = { ...api.current[0].get() };
    await asyncStart(
      api,
      signal,
    )({
      y: current.y + (matStore.isMe(card.location.controller) ? -1 : 1) * 120, // TODO: 放到config之中
      ry: 0,
      // rz: 0,
      z: current.z + 50,
    });
    await asyncStart(api, signal)(current);
  } else {
    await asyncStart(
      api,
      signal,
    )({
      focusScale: 1.5,
      focusDisplay: "block",
      focusOpacity: 0,
    });
    if (!signal?.aborted)
      api.set({ focusScale: 1, focusOpacity: 1, focusDisplay: "none" });
  }
};
