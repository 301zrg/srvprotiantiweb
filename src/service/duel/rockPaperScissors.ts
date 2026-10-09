import i18next from "i18next";

import { ygopro } from "@/api";
import { displayOptionModal } from "@/ui/Duel/Message";

export default async (mora: ygopro.StocGameMessage.MsgRockPaperScissors) => {
  const _player = mora.player;

  // TODO: I18n
  await displayOptionModal(
    i18next.t("WaitRoom:PlsRockPaperScissors"),
    [
      { info: i18next.t("WaitRoom:Rock"), response: 1 },
      { info: i18next.t("WaitRoom:Scissors"), response: 2 },
      { info: i18next.t("WaitRoom:Paper"), response: 3 },
    ],
    1,
  );
};
