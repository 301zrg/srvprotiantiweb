import React from "react";
import { proxy, useSnapshot } from "valtio";

import { fetchStrings, Region, ygopro } from "@/api";
import { cardStore, CardType } from "@/stores";
import { YgoCard } from "@/ui/Shared";
import { DuelPanel } from "@/ui/Shared/DuelPanel";

import { showCardModal } from "../CardModal";
import styles from "./index.module.scss";

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
    <DuelPanel
      open={isOpen}
      onClose={handleOkOrCancel}
      title={`${fetchStrings(Region.System, filterZone + 1000)} (${
        cardList.length
      })`}
      testId="duel-card-list-panel"
      compact
      desktopWidth="160px"
    >
      <div
        className={styles.cards}
        data-testid="duel-card-list"
        data-card-count={cardList.length}
      >
        {cardList.map((card) => (
          <button
            type="button"
            aria-label={card.meta.text.name || String(card.code)}
            data-card-code={card.code}
            key={card.uuid}
            onClick={() => showCardModal(card)}
          >
            <YgoCard code={card.code} targeted={card.targeted} width="100%" />
          </button>
        ))}
      </div>
    </DuelPanel>
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
