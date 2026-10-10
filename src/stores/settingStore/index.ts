import { isSSR } from "@react-spring/shared";
import { pick } from "lodash-es";
import { proxy, subscribe } from "valtio";

import { storageKey } from "@/variant/deployment";

import { type NeosStore } from "../shared";
import { AnimationConfig, defaultAnimationConfig } from "./animation";
import { AudioConfig, defaultAudioConfig } from "./audio";

/** 将设置保存到本地 */
const NEO_SETTING_CONFIG = storageKey("__neo_setting_config__");

/** 设置项 */
type SettingStoreConfig = Pick<
  SettingStore,
  "audio" | "animation" | "showServerMessages" | "confirmOperations"
>;

/** 默认设置 */
const defaultSettingConfig: SettingStoreConfig = {
  audio: defaultAudioConfig,
  animation: defaultAnimationConfig,
  showServerMessages: true,
  confirmOperations: false,
};

/** 获取默认设置 */
function getDefaultSetting() {
  if (!isSSR()) {
    /** 获取默认设置 */
    try {
      const setting = localStorage.getItem(NEO_SETTING_CONFIG);
      if (setting) {
        const config = JSON.parse(setting) as SettingStoreConfig;
        return {
          confirmOperations: config.confirmOperations === true,
          audio: config.audio ?? defaultAudioConfig,
          animation: config.animation ?? defaultAnimationConfig,
          showServerMessages:
            typeof config.showServerMessages === "boolean"
              ? config.showServerMessages
              : true,
        };
      }
    } catch {
      // Settings remain usable when browser storage is unavailable or damaged.
    }
  }
  return defaultSettingConfig;
}

const defaultSetting = getDefaultSetting();

/** 设置模块 */
class SettingStore implements NeosStore {
  /** 音频设置 */
  audio: AudioConfig = defaultSetting.audio;

  /** Animation Configuration */
  animation: AnimationConfig = defaultSetting.animation;

  /** Only controls server chat popups, not required duel choices or errors. */
  showServerMessages: boolean = defaultSetting.showServerMessages;

  confirmOperations: boolean = defaultSetting.confirmOperations;

  /** 保存音频设置 */
  saveAudioConfig(config: Partial<AudioConfig>): void {
    Object.assign(this.audio, config);
  }

  /** save Animation Configuration */
  saveAnimationConfig(config: Partial<AnimationConfig>): void {
    Object.assign(this.animation, config);
  }

  reset(): void {
    const defaultSetting = getDefaultSetting();
    this.audio = defaultSetting.audio;
    this.animation = defaultSetting.animation;
    this.showServerMessages = defaultSetting.showServerMessages;
    this.confirmOperations = defaultSetting.confirmOperations;
  }
}

/** 设置项 */
export const settingStore = proxy(new SettingStore());

/** 持久化设置项 */
subscribe(settingStore, () => {
  if (!isSSR()) {
    try {
      localStorage.setItem(
        NEO_SETTING_CONFIG,
        JSON.stringify(
          pick(settingStore, [
            "audio",
            "animation",
            "showServerMessages",
            "confirmOperations",
          ]),
        ),
      );
    } catch {
      // Keep the current session's settings even if persistence is blocked.
    }
  }
});
