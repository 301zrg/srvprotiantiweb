import { Button, Checkbox, Collapse, Radio, Typography } from "antd";
import { useState } from "react";
import { useSnapshot } from "valtio";

import { getUIContainer } from "@/container/compat";
import { ChainSetting } from "@/stores/matStore/types";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { getDuelDiagnostics } from "@/variant/duelDiagnostics";
import { duelInteractionMessages } from "@/variant/duelInteraction";
import { previewMessages } from "@/variant/previewMessages";

export const OperationSetting = () => {
  const { confirmOperations, chainSetting, randomRpsMode } =
    useSnapshot(settingStore);
  const { language } = useI18N();
  const text = duelInteractionMessages(language);
  const preview = previewMessages(language);
  const [report, setReport] = useState<string>();
  return (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 20px" }}>
        <legend style={{ fontSize: 14 }}>{preview.chainMode}</legend>
        <Radio.Group
          value={chainSetting}
          onChange={(event) => {
            settingStore.chainSetting = event.target.value;
          }}
        >
          <Radio data-testid="setting-chain-2" value={ChainSetting.CHAIN_SMART}>
            {preview.chainSmart}
          </Radio>
          <Radio data-testid="setting-chain-0" value={ChainSetting.CHAIN_ALL}>
            {preview.chainAll}
          </Radio>
          <Radio
            data-testid="setting-chain-1"
            value={ChainSetting.CHAIN_IGNORE}
          >
            {preview.chainIgnore}
          </Radio>
        </Radio.Group>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {preview.chainHelp}
        </Typography.Paragraph>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 20px" }}>
        <legend style={{ fontSize: 14 }}>{preview.randomRps}</legend>
        <Radio.Group
          value={randomRpsMode}
          onChange={(event) => {
            settingStore.randomRpsMode = event.target.value;
          }}
        >
          <Radio data-testid="setting-random-rps-off" value="off">
            {preview.off}
          </Radio>
          <Radio data-testid="setting-random-rps-suggest" value="suggest">
            {preview.suggest}
          </Radio>
          <Radio data-testid="setting-random-rps-play" value="play">
            {preview.playRandom}
          </Radio>
        </Radio.Group>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {preview.randomHelp}
        </Typography.Paragraph>
      </fieldset>
      <Checkbox
        data-testid="confirm-operations-setting"
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        checked={confirmOperations}
        onChange={(event) => {
          settingStore.confirmOperations = event.target.checked;
        }}
      >
        {text.confirmSetting}
      </Checkbox>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {text.help}
      </Typography.Paragraph>
      <Collapse
        items={[
          {
            key: "diagnostics",
            label: preview.troubleshooting,
            children: (
              <>
                <Button
                  data-testid="duel-diagnostics-open"
                  style={{ minHeight: 44 }}
                  onClick={() => {
                    let owner;
                    try {
                      owner = getUIContainer().conn;
                    } catch {
                      /* No duel connection yet. */
                    }
                    setReport(
                      JSON.stringify(getDuelDiagnostics(owner), null, 2),
                    );
                  }}
                >
                  {text.diagnostics}
                </Button>
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginTop: 12 }}
                >
                  {text.diagnosticsHelp}
                </Typography.Paragraph>
                {report && (
                  <Typography.Paragraph
                    data-testid="duel-diagnostics-report"
                    copyable={{ text: report }}
                  >
                    <pre
                      style={{
                        maxHeight: "25vh",
                        overflow: "auto",
                        fontSize: 12,
                      }}
                    >
                      {report}
                    </pre>
                  </Typography.Paragraph>
                )}
              </>
            ),
          },
        ]}
      />
    </>
  );
};
