import { AudioActionType } from "../type";
import { NeosAudioContext } from "./context";
import {
  getEffectName,
  getMusicName,
  loadAudio,
  removeAudio,
} from "./resource";

class AudioManager {
  // Audio is optional; missing/blocked Web Audio must not abort module loading.
  private musicContext?: NeosAudioContext;
  private effectContextSet = new Set<NeosAudioContext>();
  private effectGeneration = 0;
  /** 当前播放的音频路径 */
  private _currentMusicPath: string = "";
  private _scene: AudioActionType | null = null;
  private _musicVolume = 1;

  public enableBGM = false;
  public get scene() {
    return this._scene;
  }

  public set scene(scene: AudioActionType | null) {
    this._scene = scene;
    if (this.enableBGM) {
      this.playMusic();
    }
  }

  public async playMusic() {
    if (!this.enableBGM || !this._scene) return;
    const name = getMusicName(this._scene, this._currentMusicPath);
    try {
      if (this.musicContext && !this.musicContext.closed)
        await this.musicContext.close();
      this.musicContext = new NeosAudioContext(this._musicVolume);
      this.musicContext.once("ended", () => {
        void this.playMusic();
      });
      const resource = await loadAudio(name);
      await this.musicContext.play(resource);
      this._currentMusicPath = name;
    } catch {
      // 音频资源有问题
      removeAudio(name);
    }
  }

  public async playEffect(effect: AudioActionType, volume = 1) {
    const name = getEffectName(effect);
    if (!name) return;
    const generation = this.effectGeneration;
    let audioContext: NeosAudioContext | undefined;
    try {
      audioContext = new NeosAudioContext(volume);
      const current = audioContext;
      audioContext.once("ended", () => {
        this.effectContextSet.delete(current);
      });
      this.effectContextSet.add(audioContext);
      const resource = await loadAudio(name);
      if (generation !== this.effectGeneration || audioContext.closed) return;
      await audioContext.play(resource);
    } catch {
      if (audioContext) {
        this.effectContextSet.delete(audioContext);
        void audioContext.close();
      }
      void removeAudio(name);
    }
  }

  /** Also cancels downloads/decodes which have not started a source yet. */
  public stopEffects() {
    this.effectGeneration++;
    for (const context of this.effectContextSet) void context.close();
    this.effectContextSet.clear();
  }

  public updateEffectsVolume(volume = 1) {
    for (const context of this.effectContextSet) context.updateVolume(volume);
  }

  public updateMusicVolume(volume = 1) {
    this._musicVolume = volume;
    this.musicContext?.updateVolume(volume);
  }

  public enableMusic() {
    this.enableBGM = true;
    this.playMusic();
  }

  public disableMusic() {
    this.enableBGM = false;
    void this.musicContext?.suspend();
  }

  public switchDisableMusic() {
    if (this.enableBGM) {
      this.disableMusic();
    } else {
      this.enableMusic();
    }
  }
}

export const audioContextManger = new AudioManager();
