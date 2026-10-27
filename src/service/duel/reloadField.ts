import { v4 as v4uuid } from "uuid";

import { ygopro } from "@/api";
import { Container } from "@/container";
import { isUIContainer } from "@/container/compat";
import { closeCardListModal } from "@/ui/Duel/Message/CardListModal";
import { closeCardModal } from "@/ui/Duel/Message/CardModal";

import { genCard } from "../utils";
import { prepareDuelPresentation } from "./presentation";
type MsgReloadField = ygopro.StocGameMessage.MsgReloadField;

export default async (container: Container, field: MsgReloadField) => {
  const context = container.context;
  const presented = isUIContainer(container)
    ? prepareDuelPresentation(container)
    : undefined;
  // MSG_START prepared the token reserve. A field snapshot replaces visible
  // zones, but later token summons still need these unused card components.
  const tokens = context.cardStore.inner
    .filter((card) => card.location.zone === ygopro.CardZone.TZONE)
    .map((card) => genCard({ ...card, uuid: v4uuid() }));
  // 重置
  context.cardStore.reset();
  closeCardModal();
  closeCardListModal();

  const actions = field.actions;
  actions.forEach((action) => {
    const controller = action.player;
    // 更新生命值
    context.matStore.initInfo.of(controller).life = action.lp;
    // 更新卡片集合
    const cards = action.zone_actions
      .map((zoneAction) =>
        Array.from({ length: zoneAction.overlay_count + 1 }).map(
          (_, overlaySequence) =>
            genCard({
              uuid: v4uuid(),
              code: 0,
              location: new ygopro.CardLocation({
                controller,
                zone: zoneAction.zone,
                sequence: zoneAction.sequence,
                is_overlay: overlaySequence > 0,
                overlay_sequence: Math.max(overlaySequence - 1, 0),
                position: zoneAction.position,
              }),
              counters: {},
              idleInteractivities: [],
              meta: { id: 0, data: {}, text: {} },
              isToken: false,
              targeted: false,
              selectInfo: {
                selectable: false,
                selected: false,
              },
              status: 0,
            }),
        ),
      )
      .flat();
    context.cardStore.inner.push(...cards);
  });
  context.cardStore.inner.push(...tokens);
  // Query updates can move the newly created cards. Wait for their handlers,
  // just as MSG_START does, instead of losing the first animation callback.
  if (presented) await presented;
};
