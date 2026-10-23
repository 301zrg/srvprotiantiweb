import { Checkbox, Radio, Typography } from "antd";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { controlPanelMessages } from "@/variant/controlPanelMessages";
import { previewMessages } from "@/variant/previewMessages";

export const MessageSetting = () => {
  const { serverMessageMode, showZoneCounts, hidePlayerIds, controlPanelSide } =
    useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  const revision = clientRevisionMessages(language);
  const panel = controlPanelMessages(language);
  return (
    <>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend style={{ fontSize: 14 }}>{panel.position}</legend>
        <Radio.Group
          value={controlPanelSide}
          onChange={(event) => {
            settingStore.controlPanelSide = event.target.value;
          }}
        >
          <Radio data-testid="setting-control-left" value="left">
            {panel.left}
          </Radio>
          <Radio data-testid="setting-control-right" value="right">
            {panel.right}
          </Radio>
        </Radio.Group>
      </fieldset>
      <Checkbox
        data-testid="setting-zone-counts"
        checked={showZoneCounts}
        onChange={(event) => {
          settingStore.showZoneCounts = event.target.checked;
        }}
      >
        {revision.showZoneCounts}
      </Checkbox>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {revision.showZoneCountsHelp}
      </Typography.Paragraph>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <Checkbox
          data-testid="setting-hide-player-ids"
          checked={hidePlayerIds}
          onChange={(event) => {
            settingStore.hidePlayerIds = event.target.checked;
          }}
        >
          {revision.hidePlayerIds}
        </Checkbox>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {revision.hidePlayerIdsHelp}
        </Typography.Paragraph>
      </fieldset>
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
    </>
  );
};
