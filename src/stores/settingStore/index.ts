import { isSSR } from "@react-spring/shared";
import { pick } from "lodash-es";
import { proxy, subscribe } from "valtio";

import { storageKey } from "@/variant/deployment";

import { type NeosStore } from "../shared";
import { AnimationConfig } from "./animation";
import { AudioConfig } from "./audio";
import { normalizeSetting, SettingConfig } from "./config";

export type { HistoryOrder, RandomRpsMode, ServerMessageMode } from "./config";

/** 将设置保存到本地 */
const NEO_SETTING_CONFIG = storageKey("__neo_setting_config__");

/** 获取默认设置 */
function getDefaultSetting(): SettingConfig {
  if (!isSSR()) {
    /** 获取默认设置 */
    try {
      const setting = localStorage.getItem(NEO_SETTING_CONFIG);
      if (setting) {
        return normalizeSetting(JSON.parse(setting));
      }
    } catch {
      // Settings remain usable when browser storage is unavailable or damaged.
    }
  }
  return normalizeSetting(undefined);
}

const defaultSetting = getDefaultSetting();

/** 设置模块 */
class SettingStore implements NeosStore {
  /** 音频设置 */
  audio: AudioConfig = defaultSetting.audio;

  /** Animation Configuration */
  animation: AnimationConfig = defaultSetting.animation;

  chainSetting = defaultSetting.chainSetting;
  randomRpsMode = defaultSetting.randomRpsMode;
  serverMessageMode = defaultSetting.serverMessageMode;
  showZoneCounts = defaultSetting.showZoneCounts;
  hidePlayerIds = defaultSetting.hidePlayerIds;
  replaySpeed = defaultSetting.replaySpeed;
  replayAutoPlay = defaultSetting.replayAutoPlay;
  controlPanelSide = defaultSetting.controlPanelSide;
  historyOrder = defaultSetting.historyOrder;

  /** Compatibility for older callers; persistence uses serverMessageMode only. */
  get showServerMessages() {
    return this.serverMessageMode !== "record";
  }
  set showServerMessages(show: boolean) {
    this.serverMessageMode = show ? "popup" : "record";
  }

  confirmOperations: boolean = defaultSetting.confirmOperations;

  /** 保存音频设置 */
  saveAudioConfig(config: Partial<AudioConfig>): void {
    this.audio = normalizeSetting({
      audio: { ...this.audio, ...config },
    }).audio;
  }

  /** save Animation Configuration */
  saveAnimationConfig(config: Partial<AnimationConfig>): void {
    Object.assign(this.animation, config);
  }

  reset(): void {
    const defaultSetting = getDefaultSetting();
    this.audio = defaultSetting.audio;
    this.animation = defaultSetting.animation;
    this.chainSetting = defaultSetting.chainSetting;
    this.randomRpsMode = defaultSetting.randomRpsMode;
    this.serverMessageMode = defaultSetting.serverMessageMode;
    this.showZoneCounts = defaultSetting.showZoneCounts;
    this.hidePlayerIds = defaultSetting.hidePlayerIds;
    this.replaySpeed = defaultSetting.replaySpeed;
    this.replayAutoPlay = defaultSetting.replayAutoPlay;
    this.controlPanelSide = defaultSetting.controlPanelSide;
    this.historyOrder = defaultSetting.historyOrder;
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
            "chainSetting",
            "randomRpsMode",
            "serverMessageMode",
            "showZoneCounts",
            "hidePlayerIds",
            "replaySpeed",
            "replayAutoPlay",
            "controlPanelSide",
            "historyOrder",
            "confirmOperations",
          ]),
        ),
      );
    } catch {
      // Keep the current session's settings even if persistence is blocked.
    }
  }
});
