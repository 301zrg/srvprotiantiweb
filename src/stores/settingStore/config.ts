import { ChainSetting } from "../matStore/types";
import { AnimationConfig, defaultAnimationConfig } from "./animation";
import { AudioConfig, defaultAudioConfig } from "./audio";

export type RandomRpsMode = "off" | "suggest" | "play";
export type ServerMessageMode = "auto" | "popup" | "record";
export type HistoryOrder = "oldest" | "newest";
/** "auto": text rows on the mobile interface, card art on desktop. */
export type HistoryStyle = "auto" | "image" | "text";
/** Duel chat order; "history" follows the action log order. */
export type ChatOrder = "history" | HistoryOrder;
export const replaySpeeds = [0.5, 1, 2, 4, 8, 16] as const;

export interface SettingConfig {
  audio: AudioConfig;
  animation: AnimationConfig;
  confirmOperations: boolean;
  chainSetting: ChainSetting;
  randomRpsMode: RandomRpsMode;
  serverMessageMode: ServerMessageMode;
  showZoneCounts: boolean;
  hidePlayerIds: boolean;
  replaySpeed: number;
  replayAutoPlay: boolean;
  controlPanelSide: "left" | "right";
  historyOrder: HistoryOrder;
  historyStyle: HistoryStyle;
  chatOrder: ChatOrder;
  /** Spectators keep the same room seat near them across games of a match. */
  spectatorKeepSeat: boolean;
}

/** Normalize old browser settings without letting the old replay flag unmute. */
export function normalizeSetting(value: unknown): SettingConfig {
  const config = (
    value && typeof value === "object" ? value : {}
  ) as Partial<SettingConfig> & {
    showServerMessages?: boolean;
  };
  const audio = config.audio ?? {};
  const { enableReplaySoundEffects: _legacyReplaySound, ...sharedAudio } =
    audio;
  const volume = audio.soundEffectsVolume;
  return {
    audio: {
      ...defaultAudioConfig,
      ...sharedAudio,
      enableSoundEffects: audio.enableSoundEffects === true,
      soundEffectsVolume:
        typeof volume === "number" && Number.isFinite(volume)
          ? Math.max(0, Math.min(1, volume))
          : defaultAudioConfig.soundEffectsVolume,
    },
    animation: { ...defaultAnimationConfig, ...config.animation },
    confirmOperations: config.confirmOperations === true,
    showZoneCounts: config.showZoneCounts !== false,
    hidePlayerIds: config.hidePlayerIds === true,
    replaySpeed: replaySpeeds.includes(
      config.replaySpeed as (typeof replaySpeeds)[number],
    )
      ? config.replaySpeed!
      : 1,
    replayAutoPlay: config.replayAutoPlay !== false,
    controlPanelSide: config.controlPanelSide === "right" ? "right" : "left",
    historyOrder: config.historyOrder === "newest" ? "newest" : "oldest",
    historyStyle:
      config.historyStyle === "image" || config.historyStyle === "text"
        ? config.historyStyle
        : "auto",
    chatOrder:
      config.chatOrder === "oldest" || config.chatOrder === "newest"
        ? config.chatOrder
        : "history",
    spectatorKeepSeat: config.spectatorKeepSeat !== false,
    chainSetting: [
      ChainSetting.CHAIN_ALL,
      ChainSetting.CHAIN_IGNORE,
      ChainSetting.CHAIN_SMART,
    ].includes(config.chainSetting as ChainSetting)
      ? (config.chainSetting as ChainSetting)
      : ChainSetting.CHAIN_SMART,
    randomRpsMode:
      config.randomRpsMode === "off" || config.randomRpsMode === "play"
        ? config.randomRpsMode
        : "suggest",
    serverMessageMode:
      config.serverMessageMode === "record" ||
      config.serverMessageMode === "popup" ||
      config.serverMessageMode === "auto"
        ? config.serverMessageMode
        : config.showServerMessages === false
        ? "record"
        : "auto",
  };
}
