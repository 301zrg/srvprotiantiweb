import { App } from "antd";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { rpsFeedback } from "@/service/mora/feedback";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { previewFormat } from "@/variant/previewMessages";

import { useI18N } from "./I18N";

/** Mounted once across room/duel routes, including repeated identical ties. */
export const RpsFeedback = () => {
  const {
    played: { serial: playedSerial, hand: playedHand },
    result: { serial: resultSerial, outcome },
  } = useSnapshot(rpsFeedback);
  const { language } = useI18N();
  const { t } = useTranslation("WaitRoom");
  const { message } = App.useApp();
  useEffect(() => {
    if (!playedSerial) return;
    message.info({
      key: "rps-played",
      duration: 6,
      content: previewFormat(clientRevisionMessages(language).playedRps, {
        hand: t(["", "Scissors", "Rock", "Paper"][playedHand]),
      }),
    });
  }, [playedSerial]);
  useEffect(() => {
    if (!resultSerial || !outcome) return;
    const words = clientRevisionMessages(language);
    message.open({
      key: "rps-outcome",
      duration: 6,
      type: outcome === "win" ? "success" : "info",
      content: { win: words.rpsWin, lose: words.rpsLose, tie: words.rpsTie }[
        outcome
      ],
    });
  }, [resultSerial]);
  return null;
};
