import { Radio, Typography } from "antd";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { previewMessages } from "@/variant/previewMessages";

export const MessageSetting = () => {
  const { serverMessageMode } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
      <legend style={{ fontSize: 14 }}>{text.messageMode}</legend>
      <Radio.Group
        value={serverMessageMode}
        onChange={(event) => {
          settingStore.serverMessageMode = event.target.value;
        }}
      >
        <Radio data-testid="setting-message-auto" value="auto">
          {text.automatic}
        </Radio>
        <Radio data-testid="setting-message-popup" value="popup">
          {text.popup}
        </Radio>
        <Radio data-testid="setting-message-record" value="record">
          {text.recordOnly}
        </Radio>
      </Radio.Group>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {text.messageHelp}
      </Typography.Paragraph>
    </fieldset>
  );
};
