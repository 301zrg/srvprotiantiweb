import { Button, Typography } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { RpsHand, RpsRequest } from "@/service/mora/request";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
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
  onSelect: (hand: RpsHand) => void;
  testPrefix: "waitroom" | "effect";
}) => {
  const { randomRpsMode } = useSnapshot(settingStore);
  const [suggestion, setSuggestion] = useState<RpsHand>();
  const { t } = useTranslation("WaitRoom");
  const { language } = useI18N();
  const text = previewMessages(language);
  useEffect(() => setSuggestion(undefined), [requestId, randomRpsMode]);
  if (randomRpsMode === "off") return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Button
        data-testid={`${testPrefix}-random-rps`}
        style={{ minHeight: 44 }}
        onClick={() => {
          const mode = settingStore.randomRpsMode;
          const hand = request.random(requestId, owner, epoch, mode);
          if (hand === undefined) return;
          if (mode === "play") onSelect(hand);
          else setSuggestion(hand);
        }}
      >
        {randomRpsMode === "play" ? text.playRandom : text.randomRps}
      </Button>
      {suggestion !== undefined && (
        <Typography.Text
          data-testid={`${testPrefix}-rps-suggestion`}
          aria-live="polite"
        >
          {previewFormat(text.suggestion, {
            hand: t(["Rock", "Scissors", "Paper"][suggestion - 1]),
          })}
        </Typography.Text>
      )}
    </div>
  );
};
