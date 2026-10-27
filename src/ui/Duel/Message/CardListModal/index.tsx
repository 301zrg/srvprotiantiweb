import { Button } from "antd";
import React from "react";
import { proxy, useSnapshot } from "valtio";

import { fetchStrings, Region, ygopro } from "@/api";
import { cardStore, CardType } from "@/stores";
import { useI18N } from "@/ui/I18N";
import { replayCardWords } from "@/ui/Replay/cardState";
import { ChainTag, YgoCard } from "@/ui/Shared";
import { DuelPanel } from "@/ui/Shared/DuelPanel";
import { previewMessages } from "@/variant/previewMessages";

import { deckCardFaceUp, visibleDeckCode } from "../../PlayMat/deckVisibility";
import { closeCardModal, showCardModal } from "../CardModal";
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
  const { language } = useI18N();
  const text = previewMessages(language);
  const { zone, monster, isOpen, isZone, controller } = useSnapshot(store);
  const { inner, deckReversed } = useSnapshot(cardStore);
  const filterZone = isZone ? zone : monster.location.zone;
  const filterController = isZone ? controller : monster.location.controller;
  const filterSequence = isZone ? undefined : monster.location.sequence;
  const overlay = !isZone;
  const cardList = inner
    .filter(
      (card) =>
        card.location.zone === filterZone &&
        card.location.controller === filterController &&
        card.location.is_overlay === overlay &&
        (filterSequence === undefined ||
          card.location.sequence === filterSequence),
    )
    .sort((a, b) =>
      overlay
        ? a.location.overlay_sequence - b.location.overlay_sequence
        : b.location.sequence - a.location.sequence,
    );

  const handleOkOrCancel = () => {
    store.isOpen = false;
  };

  return (
    <DuelPanel
      open={isOpen}
      onClose={handleOkOrCancel}
      title={`${
        overlay
          ? replayCardWords(language).materials
          : fetchStrings(Region.System, filterZone + 1000)
      } (${cardList.length})`}
      testId="duel-card-list-panel"
      compact
      desktopWidth="160px"
    >
      {overlay && (
        <Button
          data-testid="duel-material-host-details"
          onClick={() => showCardModal(monster)}
        >
          {text.details}
        </Button>
      )}
      <div
        className={styles.cards}
        data-testid="duel-card-list"
        data-card-count={cardList.length}
      >
        {cardList.length === 0 && <p>{text.emptyZone}</p>}
        {cardList.map((card, index) => {
          const hidden =
            !overlay &&
            filterZone === ygopro.CardZone.DECK &&
            !deckCardFaceUp(card, deckReversed);
          const code =
            !overlay && filterZone === ygopro.CardZone.DECK
              ? visibleDeckCode(card, deckReversed)
              : card.code;
          return (
            <button
              type="button"
              aria-label={
                hidden || !code
                  ? `${fetchStrings(Region.System, 1000)} ${index + 1}`
                  : card.meta.text.name || String(code)
              }
              data-card-code={code}
              data-card-facedown={hidden}
              disabled={hidden || !code}
              key={card.uuid}
              onClick={() => {
                if (!hidden && code) showCardModal(card);
              }}
            >
              <YgoCard
                code={code}
                isBack={hidden || !code}
                targeted={card.targeted}
                width="100%"
              />
              <ChainTag location={card.location} className={styles.chain} />
            </button>
          );
        })}
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
  // A pile tap switches the panel to that list instead of stacking under an
  // older card detail; details opened from the list still stack above it.
  closeCardModal();
  store.isOpen = true;
  store.isZone = isZone ?? false;
  monster && (store.monster = monster);
  zone !== undefined && (store.zone = zone);
  controller !== undefined && (store.controller = controller);
};
