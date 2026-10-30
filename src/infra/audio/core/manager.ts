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
  // Effects share one context (unlocked by a gesture) and decoded buffers;
  // a context per effect stayed suspended on iOS and played later in a burst.
  private effectContext?: AudioContext;
  private effectGain?: GainNode;
  private effectBuffers = new Map<string, Promise<AudioBuffer>>();
  private effectSources = new Set<AudioBufferSourceNode>();
  private effectGeneration = 0;
  private effectVolume = 1;
  /** Set from the sound setting; gestures only unlock when effects are on. */
  public effectsWanted = false;
  /** 当前播放的音频路径 */
  private _currentMusicPath: string = "";
  private _scene: AudioActionType | null = null;
  private _musicVolume = 1;

  public enableBGM = false;

  constructor() {
    this.installEffectUnlock();
  }
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
    // Created on the first online effect, never by a mere tap elsewhere
    // (replays and the hand test have their own audio).
    if (!this.effectContext || this.effectContext.state !== "running")
      this.unlockEffects();
    const context = this.effectContext;
    // Mobile Safari keeps a context created without a gesture suspended and
    // used to start every effect once the next tap resumed it, all at once.
    // Effects are momentary: if the shared context is not running now, skip.
    if (!context || context.state !== "running") return;
    const generation = this.effectGeneration,
      requested = performance.now();
    this.effectVolume = volume;
    try {
      const buffer = await this.effectBuffer(context, name);
      if (
        generation !== this.effectGeneration ||
        context.state !== "running" ||
        // A slow first download/decode must not play a stale effect late.
        performance.now() - requested > 600
      )
        return;
      // Bursts (e.g. many cards moving) must not pile up voices.
      while (this.effectSources.size >= 6) {
        const oldest = this.effectSources.values().next()
          .value as AudioBufferSourceNode;
        oldest.stop();
        this.effectSources.delete(oldest);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.effectGain!);
      this.effectGain!.gain.value = this.effectVolume;
      source.onended = () => {
        this.effectSources.delete(source);
        source.disconnect();
      };
      this.effectSources.add(source);
      source.start();
    } catch {
      // Optional audio; a broken cache entry is dropped by effectBuffer.
    }
  }

  /** One decoded buffer per effect name, shared by every later play. */
  private effectBuffer(context: AudioContext, name: string) {
    let buffer = this.effectBuffers.get(name);
    if (!buffer) {
      buffer = loadAudio(name).then((bytes) =>
        context.decodeAudioData(bytes.slice(0)),
      );
      this.effectBuffers.set(name, buffer);
      void buffer.catch(() => {
        if (this.effectBuffers.get(name) === buffer)
          this.effectBuffers.delete(name);
        void removeAudio(name);
      });
    }
    return buffer;
  }

  /** Create or resume the shared effect context; call from a user gesture. */
  public unlockEffects() {
    try {
      if (!this.effectContext || this.effectContext.state === "closed") {
        const Audio =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!Audio) return;
        this.effectContext = new Audio();
        this.effectGain = this.effectContext.createGain();
        this.effectGain.gain.value = this.effectVolume;
        this.effectGain.connect(this.effectContext.destination);
        this.effectBuffers.clear();
      }
      if (this.effectContext.state !== "running")
        void this.effectContext.resume().catch(() => {});
    } catch {
      // Unsupported or denied audio leaves the game silent, never broken.
    }
  }

  /** Any tap, click or key resumes an existing effect context. */
  private installEffectUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.effectsWanted && this.effectContext) this.unlockEffects();
    };
    for (const type of ["pointerdown", "touchend", "click", "keydown"])
      window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  /** Also cancels downloads/decodes which have not started a source yet. */
  public stopEffects() {
    this.effectGeneration++;
    for (const source of this.effectSources) source.stop();
    this.effectSources.clear();
  }

  public updateEffectsVolume(volume = 1) {
    this.effectVolume = volume;
    if (this.effectGain) this.effectGain.gain.value = volume;
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
