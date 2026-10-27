import { fetchStrings, Region, ygopro } from "@/api";
import { displayOptionModal } from "@/ui/Duel/Message";
import MsgAnnounce = ygopro.StocGameMessage.MsgAnnounce;
import type { Container } from "@/container";
import { displayAnnounceModal } from "@/ui/Duel/Message/AnnounceModal";
import type { ValueResultKind } from "@/variant/duelResults";

export default async (container: Container, announce: MsgAnnounce) => {
  const type_ = announce.announce_type;
  let min = announce.min;
  if (
    type_ === MsgAnnounce.AnnounceType.Card ||
    type_ === MsgAnnounce.AnnounceType.Number
  ) {
    min = 1;
  }
  const record = (kind: ValueResultKind, value: number) =>
    container.context.historyStore.putResult(
      container.context,
      { kind, value },
      announce.player,
      0,
      "response",
    );

  switch (type_) {
    case MsgAnnounce.AnnounceType.RACE: {
      const response = await displayOptionModal(
        fetchStrings(Region.System, 563),
        announce.options.map((option) => ({
          info: fetchStrings(Region.System, 1020 + option.code),
          response: option.response,
        })),
        min,
      );
      record("race", response);

      break;
    }
    case MsgAnnounce.AnnounceType.Attribute: {
      const response = await displayOptionModal(
        fetchStrings(Region.System, 562),
        announce.options.map((option) => ({
          info: fetchStrings(Region.System, 1010 + option.code),
          response: option.response,
        })),
        min,
      );
      record("attribute", response);

      break;
    }
    case MsgAnnounce.AnnounceType.Card: {
      const response = await displayAnnounceModal(
        announce.options.map((option) => option.code),
      );
      container.context.historyStore.putAnnounce(
        container.context,
        response,
        announce.player,
        "response",
      );

      break;
    }
    case MsgAnnounce.AnnounceType.Number: {
      const response = await displayOptionModal(
        fetchStrings(Region.System, 565),
        announce.options.map((option) => ({
          info: option.code.toString(),
          response: option.response,
        })),
        min,
      );
      const option = announce.options.find(
        (option) => option.response === response,
      );
      if (option) record("number", option.code);

      break;
    }
    default: {
      console.warn(`Unknown announce_type = ${type_}`);
    }
  }
};
