import { Button, Checkbox, Typography } from "antd";
import { useState } from "react";
import { useSnapshot } from "valtio";

import { getUIContainer } from "@/container/compat";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { getDuelDiagnostics } from "@/variant/duelDiagnostics";
import { duelInteractionMessages } from "@/variant/duelInteraction";

export const OperationSetting = () => {
  const { confirmOperations } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = duelInteractionMessages(language);
  const [report, setReport] = useState<string>();
  return (
    <>
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
          setReport(JSON.stringify(getDuelDiagnostics(owner), null, 2));
        }}
      >
        {text.diagnostics}
      </Button>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {text.diagnosticsHelp}
      </Typography.Paragraph>
      {report && (
        <Typography.Paragraph
          data-testid="duel-diagnostics-report"
          copyable={{ text: report }}
        >
          <pre style={{ maxHeight: "25vh", overflow: "auto", fontSize: 12 }}>
            {report}
          </pre>
        </Typography.Paragraph>
      )}
    </>
  );
};
