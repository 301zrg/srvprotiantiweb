/** 音频设置 */
export interface AudioConfig {
  /** 是否开启音乐 */
  enableMusic?: boolean;
  /** 是否开启音效 */
  enableSoundEffects?: boolean;
  /** 录像音效独立开关；旧设置中未指定时默认开启 */
  enableReplaySoundEffects?: boolean;
  /** 音乐音量大小 */
  musicVolume?: number;
  /** 音效音量大小 */
  soundEffectsVolume?: number;
  /** 是否根据环境切换音乐 */
  enableMusicSwitchByEnv?: boolean;
}

export const defaultAudioConfig: AudioConfig = {
  enableMusic: false,
  enableSoundEffects: false,
  enableReplaySoundEffects: true,
  musicVolume: 0.7,
  soundEffectsVolume: 0.7,
  enableMusicSwitchByEnv: false,
};
