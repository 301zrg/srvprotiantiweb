import { Button, Checkbox, Radio, Typography } from "antd";
import { useState } from "react";
import { useSnapshot } from "valtio";

import { clearCardImageCache } from "@/api/cardImageCache";
import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { clientRevisionMessages } from "@/variant/clientRevisionMessages";
import { controlPanelMessages } from "@/variant/controlPanelMessages";
import { previewMessages } from "@/variant/previewMessages";

export const MessageSetting = () => {
  const {
    serverMessageMode,
    showZoneCounts,
    hidePlayerIds,
    controlPanelSide,
    historyOrder,
    historyStyle,
    chatOrder,
    spectatorKeepSeat,
  } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  const revision = clientRevisionMessages(language);
  const panel = controlPanelMessages(language);
  const [cacheState, setCacheState] = useState<"" | "busy" | "done" | "none">(
    "",
  );
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
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend style={{ fontSize: 14 }}>{panel.historyOrder}</legend>
        <Radio.Group
          value={historyOrder}
          onChange={(event) => {
            settingStore.historyOrder = event.target.value;
          }}
        >
          <Radio data-testid="setting-history-oldest" value="oldest">
            {panel.oldestFirst}
          </Radio>
          <Radio data-testid="setting-history-newest" value="newest">
            {panel.newestFirst}
          </Radio>
        </Radio.Group>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {panel.historyOrderHelp}
        </Typography.Paragraph>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend style={{ fontSize: 14 }}>{panel.historyStyle}</legend>
        <Radio.Group
          value={historyStyle}
          onChange={(event) => {
            settingStore.historyStyle = event.target.value;
          }}
        >
          <Radio data-testid="setting-history-style-auto" value="auto">
            {panel.historyStyleAuto}
          </Radio>
          <Radio data-testid="setting-history-style-image" value="image">
            {panel.historyStyleImage}
          </Radio>
          <Radio data-testid="setting-history-style-text" value="text">
            {panel.historyStyleText}
          </Radio>
        </Radio.Group>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {panel.historyStyleHelp}
        </Typography.Paragraph>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend style={{ fontSize: 14 }}>{panel.chatOrder}</legend>
        <Radio.Group
          value={chatOrder}
          onChange={(event) => {
            settingStore.chatOrder = event.target.value;
          }}
        >
          <Radio data-testid="setting-chat-history" value="history">
            {panel.chatFollowHistory}
          </Radio>
          <Radio data-testid="setting-chat-oldest" value="oldest">
            {panel.oldestFirst}
          </Radio>
          <Radio data-testid="setting-chat-newest" value="newest">
            {panel.newestFirst}
          </Radio>
        </Radio.Group>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {panel.chatOrderHelp}
        </Typography.Paragraph>
      </fieldset>
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <Checkbox
          data-testid="setting-spectator-keep-seat"
          checked={spectatorKeepSeat}
          onChange={(event) => {
            settingStore.spectatorKeepSeat = event.target.checked;
          }}
        >
          {panel.spectatorKeepSeat}
        </Checkbox>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {panel.spectatorKeepSeatHelp}
        </Typography.Paragraph>
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
      <fieldset style={{ border: 0, padding: 0, margin: "16px 0" }}>
        <legend style={{ fontSize: 14 }}>{panel.cardCache}</legend>
        <Button
          data-testid="setting-clear-card-cache"
          loading={cacheState === "busy"}
          onClick={async () => {
            setCacheState("busy");
            setCacheState((await clearCardImageCache()) ? "done" : "none");
          }}
        >
          {panel.clearCardCache}
        </Button>
        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 12 }}
          data-testid="setting-card-cache-status"
        >
          {cacheState === "done"
            ? panel.cardCacheCleared
            : cacheState === "none"
            ? panel.cardCacheEmpty
            : panel.cardCacheHelp}
        </Typography.Paragraph>
      </fieldset>
    </>
  );
};
