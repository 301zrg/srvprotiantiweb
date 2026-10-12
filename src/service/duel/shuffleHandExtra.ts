import { type CardMeta, fetchCard, ygopro } from "@/api";
import { Container } from "@/container";
import { AudioActionType, playEffect } from "@/infra/audio";
import { CardType } from "@/stores";
import { callCardMove } from "@/ui/Duel/PlayMat/Card";

type MsgShuffleHandExtra = ygopro.StocGameMessage.MsgShuffleHandExtra;
const { EXTRA } = ygopro.CardZone;
const { FACEUP, FACEUP_ATTACK, FACEUP_DEFENSE } = ygopro.CardPosition;

const emptyMeta = (): CardMeta => ({ id: 0, data: {}, text: {} });

const setCardCode = (card: CardType, code: number) => {
  if (card.code === code && (code === 0 || card.meta.id !== 0)) return;

  card.code = code;
  card.meta = code > 0 ? fetchCard(code) : emptyMeta();
};

const isFaceup = (card: CardType) =>
  [FACEUP, FACEUP_ATTACK, FACEUP_DEFENSE].includes(card.location.position);

export default async (
  container: Container,
  shuffleHandExtra: MsgShuffleHandExtra,
) => {
  const context = container.context;
  playEffect(AudioActionType.SOUND_SHUFFLE);
  const { cards: codes, player: controller, zone } = shuffleHandExtra;

  const cards = context.cardStore
    .at(zone, controller)
    .slice()
    .sort((a, b) => a.location.sequence - b.location.sequence);
  const targetCards =
    zone === EXTRA ? cards.filter((card) => !isFaceup(card)) : cards;

  await Promise.all(
    targetCards.map(async (card, index) => {
      delete card.confirmedHandCode;
      const code = codes[index];
      if (code === undefined) {
        console.warn(
          `<ShuffleHandExtra>missing code, controller=${controller}, zone=${zone}, sequence=${card.location.sequence}, codes=${codes}`,
        );
        return;
      }

      setCardCode(card, code);
      await callCardMove(card.uuid);
    }),
  );
};
