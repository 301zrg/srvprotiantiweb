import React from "react";
import { proxy, useSnapshot } from "valtio";

import { type CardMeta, fetchCard, ygopro } from "@/api";
import { cardStore, type CardType, matStore } from "@/stores";
import { onlineInformationCards } from "@/ui/Duel/PlayMat/cardInformation";
import { useI18N } from "@/ui/I18N";
import { CardDetailContent } from "@/ui/Shared/DuelBoard/CardDetail";
import { DuelPanel } from "@/ui/Shared/DuelPanel";
import { mobileMessages } from "@/variant/mobileMessages";

import { extraCardTypes, TYPE_LINK, TYPE_MONSTER } from "../../../../common";
import styles from "./index.module.scss";

const defaultStore = {
  isOpen: false,
  uuid: undefined as string | undefined,
  hint: undefined as CardType["hint"],
  meta: {
    id: 0,
    data: {},
    text: {
      name: "",
      desc: "",
    },
  } satisfies CardMeta as CardMeta,
  interactivies: [] as {
    desc: string;
    response: number;
    effectCode?: number;
  }[],
  counters: {} as Record<number, number>,
};

const store = proxy(defaultStore);

export const CardModal = () => {
  const snap = useSnapshot(store);
  const { inner } = useSnapshot(cardStore);
  const { selfType, observerView } = useSnapshot(matStore);
  const uuid = snap.uuid;
  const liveCard = uuid ? inner.find((card) => card.uuid === uuid) : undefined;
  const { language } = useI18N();
  const text = mobileMessages(language);
  const { isOpen } = snap;
  const information = onlineInformationCards(
    inner,
    language,
    selfType === ygopro.StocGameMessage.MsgStart.PlayerType.Observer
      ? observerView
      : matStore.isMe(0)
      ? 0
      : 1,
    selfType !== ygopro.StocGameMessage.MsgStart.PlayerType.Observer,
  );
  const visible =
    !liveCard ||
    liveCard.location.is_overlay ||
    !information.find((card) => card.id === liveCard.uuid)?.hidden;
  const { meta: sourceMeta, counters, hint } = liveCard ?? snap;
  const meta = visible ? sourceMeta : fetchCard(0);

  const types = extraCardTypes(meta?.data.type ?? 0);
  const atk = meta?.data.atk;
  const def = meta?.data.def;
  const printed = meta?.id ? fetchCard(meta.id) : undefined;
  const faceUp =
    !!liveCard &&
    !liveCard.location.is_overlay &&
    [ygopro.CardZone.MZONE, ygopro.CardZone.SZONE].includes(
      liveCard.location.zone,
    ) &&
    [
      ygopro.CardPosition.ATTACK,
      ygopro.CardPosition.FACEUP_ATTACK,
      ygopro.CardPosition.DEFENSE,
      ygopro.CardPosition.FACEUP_DEFENSE,
    ].includes(liveCard.location.position);
  const currentIdentity =
    visible &&
    liveCard &&
    !liveCard.location.is_overlay &&
    liveCard.currentCode !== undefined
      ? { ...meta.data, currentCode: liveCard.currentCode, rank: liveCard.rank }
      : undefined;
  const name = currentIdentity?.currentCode
    ? fetchCard(currentIdentity.currentCode).text.name
    : printed?.text.name ?? meta?.text.name;
  const desc = printed?.text.desc ?? meta?.text.desc;

  return (
    <DuelPanel
      open={isOpen}
      placement="left"
      onClose={() => (store.isOpen = false)}
      title={name}
      testId="duel-card-panel"
      zIndex={1100}
      compact
      closeControl="icon"
    >
      <div
        className={styles.container}
        data-testid="duel-card-detail"
        data-card-code={meta?.id}
      >
        <CardDetailContent
          code={meta?.id ?? 0}
          language={language}
          stats={
            (((meta?.data.type ?? 0) | (printed?.data.type ?? 0)) &
              TYPE_MONSTER) !==
            0
              ? {
                  attack: atk,
                  defense: def,
                  baseAttack: liveCard?.baseAttack,
                  baseDefense: liveCard?.baseDefense,
                  printedAttack: printed?.data.atk,
                  printedDefense: printed?.data.def,
                  hasDefense: !types.includes(TYPE_LINK),
                }
              : undefined
          }
          live={faceUp && !!((meta.data.type ?? 0) & TYPE_MONSTER)}
          counters={counters}
          countersTestId="duel-card-counter"
          identity={currentIdentity}
          related={{
            id: uuid,
            cards: information,
            onLocate: () => {
              store.isOpen = false;
            },
          }}
          description={desc}
        >
          {hint && (
            <div
              className={styles.hint}
              data-testid="duel-card-hint"
              data-hint-type={hint.type}
              data-hint-value={hint.value}
            >
              <strong>
                {hint.type === 2 ? text.declaredCard : text.cardHint}
              </strong>
              <span>
                {hint.type === 2
                  ? fetchCard(hint.value).text.name ?? hint.value
                  : hint.value}
              </span>
            </div>
          )}
        </CardDetailContent>
      </div>
    </DuelPanel>
  );
};

export const showCardModal = (
  card: Partial<Pick<CardType, "uuid" | "meta" | "counters" | "hint">>,
) => {
  store.isOpen = true;
  store.meta = card?.meta ?? defaultStore.meta;
  store.counters = card?.counters ?? defaultStore.counters;
  store.uuid = card?.uuid;
  store.hint = card?.hint;
};

export const closeCardModal = () => {
  store.isOpen = false;
};
