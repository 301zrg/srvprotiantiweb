import { Drawer, Space } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { ygopro } from "@/api";
import { cardStore, CardType } from "@/stores";
import { YgoCard } from "@/ui/Shared";

import { showCardModal } from "../CardModal";

const CARD_WIDTH = "6.25rem";
const DRAWER_WIDTH = "10rem";

// TODO: 显示的位置还需要细细斟酌

const defaultStore = {
  zone: ygopro.CardZone.HAND,
  controller: 0,
  monster: {} as CardType,
  isOpen: false,
  isZone: true,
};

const store = proxy(defaultStore);

export const CardListModal = () => {
  const { zone, monster, isOpen, isZone, controller } = useSnapshot(store);
  const { inner } = useSnapshot(cardStore);
  const filterZone = isZone ? zone : monster.location.zone;
  const filterController = isZone ? controller : monster.location.controller;
  const filterSequence = isZone ? undefined : monster.location.sequence;
  const overlay = !isZone;
  const cardList = inner.filter(
    (card) =>
      card.location.zone === filterZone &&
      card.location.controller === filterController &&
      card.location.is_overlay === overlay &&
      (filterSequence === undefined ||
        card.location.sequence === filterSequence),
  );

  const handleOkOrCancel = () => {
    store.isOpen = false;
  };

  return (
    <Drawer
      open={isOpen}
      onClose={handleOkOrCancel}
      // headerStyle={{ display: "none" }}
      width={DRAWER_WIDTH}
      style={{ maxHeight: "100%" }}
      mask={false}
    >
      <div data-testid="duel-card-list" data-card-count={cardList.length}>
        <Space direction="vertical">
          {cardList.map((card) => (
            <YgoCard
              code={card.code}
              // Card identity is server-owned, including recovered materials.
              key={card.uuid}
              targeted={card.targeted}
              width={CARD_WIDTH}
              onClick={() => showCardModal(card)}
            />
          ))}
        </Space>
      </div>
    </Drawer>
  );
};

export const closeCardListModal = () => {
  store.isOpen = false;
};

export const displayCardListModal = ({
  isZone,
  monster,
  zone,
  controller,
}: Partial<Omit<typeof defaultStore, "isOpen">>) => {
  store.isOpen = true;
  store.isZone = isZone ?? false;
  monster && (store.monster = monster);
  zone && (store.zone = zone);
  controller !== undefined && (store.controller = controller);
};
