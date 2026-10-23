import { Checkbox, Select, Space } from "antd";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { replaySpeeds } from "@/stores/settingStore/config";
import { statsPlaybackMessages } from "@/variant/statsPlaybackMessages";

import { useI18N } from "../I18N";

export function ReplaySetting() {
  const setting = useSnapshot(settingStore);
  const { language } = useI18N();
  const { t } = useTranslation("ClientUI");
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        {t("ReplaySpeed")}
        <Select
          aria-label={t("ReplaySpeed")}
          data-testid="setting-replay-speed"
          value={setting.replaySpeed}
          style={{ minWidth: 100 }}
          options={replaySpeeds.map((value) => ({ value, label: `${value}×` }))}
          onChange={(value) => {
            settingStore.replaySpeed = value;
          }}
        />
      </label>
      <Checkbox
        data-testid="setting-replay-autoplay"
        checked={setting.replayAutoPlay}
        onChange={(event) => {
          settingStore.replayAutoPlay = event.target.checked;
        }}
      >
        {statsPlaybackMessages(language).autoPlay}
      </Checkbox>
    </Space>
  );
}
