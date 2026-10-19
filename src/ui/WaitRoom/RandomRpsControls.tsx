import { App, Button, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { RpsHand, RpsRequest } from "@/service/mora/request";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { previewFormat, previewMessages } from "@/variant/previewMessages";

/** This control only proposes or invokes the current request's guarded click. */
export const RandomRpsControls = ({
  request,
  requestId,
  owner,
  epoch,
  onSelect,
  testPrefix,
}: {
  request: RpsRequest;
  requestId: number;
  owner: object;
  epoch: number;
  onSelect: (hand: RpsHand) => void | boolean;
  testPrefix: "waitroom" | "effect";
}) => {
  const { randomRpsMode } = useSnapshot(settingStore);
  const [suggestion, setSuggestion] = useState<RpsHand>();
  const { t } = useTranslation("WaitRoom");
  const { language } = useI18N();
  const text = previewMessages(language);
  const { message } = App.useApp();
  useEffect(() => setSuggestion(undefined), [requestId, randomRpsMode]);
  if (randomRpsMode === "off") return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        width: "100%",
        minWidth: 0,
      }}
    >
      <Button
        data-testid={`${testPrefix}-random-rps`}
        style={{
          minHeight: 44,
          maxWidth: "100%",
          height: "auto",
          whiteSpace: "normal",
        }}
        onClick={() => {
          const mode = settingStore.randomRpsMode;
          const hand = request.random(requestId, owner, epoch, mode);
          if (hand === undefined) return;
          if (mode === "play") {
            const accepted = onSelect(hand);
            if (accepted !== false) {
              setSuggestion(hand);
              message.success({
                key: "random-rps-result",
                content: previewFormat(
                  clientRevisionMessages(language).playedRps,
                  {
                    hand: t(["Rock", "Scissors", "Paper"][hand - 1]),
                  },
                ),
                duration: 6,
              });
            }
          } else setSuggestion(hand);
        }}
      >
        {randomRpsMode === "play" ? text.playRandom : text.randomRps}
      </Button>
      {suggestion !== undefined && (
        <Typography.Text
          data-testid={`${testPrefix}-rps-suggestion`}
          aria-live="polite"
        >
          {previewFormat(
            randomRpsMode === "play"
              ? clientRevisionMessages(language).playedRps
              : text.suggestion,
            {
              hand: t(["Rock", "Scissors", "Paper"][suggestion - 1]),
            },
          )}
        </Typography.Text>
      )}
    </div>
  );
};
