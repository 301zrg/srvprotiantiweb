import { Checkbox, Typography } from "antd";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { mobileMessages } from "@/variant/mobileMessages";

export const MessageSetting = () => {
  const { showServerMessages } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = mobileMessages(language);
  return (
    <>
      <Checkbox
        data-testid="server-message-popups"
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        checked={showServerMessages}
        onChange={(event) => {
          settingStore.showServerMessages = event.target.checked;
        }}
      >
        {text.serverMessagePopups}
      </Checkbox>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {text.serverMessagePopupsHelp}
      </Typography.Paragraph>
    </>
  );
};
