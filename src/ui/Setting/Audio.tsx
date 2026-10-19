import { Slider, Switch, Typography } from "antd";
import { useSnapshot } from "valtio";

import { settingStore } from "@/stores/settingStore";
import { useI18N } from "@/ui/I18N";
import { previewMessages } from "@/variant/previewMessages";

export const AudioSetting = () => {
  const { audio } = useSnapshot(settingStore);
  const { language } = useI18N();
  const text = previewMessages(language);
  return (
    <>
      <label
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          minHeight: 44,
        }}
      >
        <span>{text.sound}</span>
        <Switch
          data-testid="shared-sound-setting"
          checked={audio.enableSoundEffects}
          onChange={(enabled) =>
            settingStore.saveAudioConfig({ enableSoundEffects: enabled })
          }
        />
      </label>
      <label htmlFor="shared-effects-volume">{text.soundVolume}</label>
      <Slider
        id="shared-effects-volume"
        data-testid="shared-effects-volume"
        style={{ maxWidth: 280 }}
        value={audio.soundEffectsVolume}
        min={0}
        max={1}
        step={0.01}
        tooltip={{ formatter: (value) => ((value ?? 0) * 100).toFixed(0) }}
        onChange={(volume) =>
          settingStore.saveAudioConfig({ soundEffectsVolume: volume })
        }
      />
      <Typography.Paragraph type="secondary">
        {text.soundHelp}
      </Typography.Paragraph>
    </>
  );
};
