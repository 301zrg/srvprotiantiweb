import { audioBlocked, UNLOCK_GESTURES } from "@/infra/audio/blocked";
import {
  getEffectName,
  loadAudio,
  removeAudio,
} from "@/infra/audio/core/resource";
import { AudioActionType as Sound } from "@/infra/audio/type";
import type { SceneAction } from "@/ui/Shared/DuelBoard/scene";

export function replaySound(action: SceneAction): string {
  const effects: Record<string, Sound> = {
    draw: Sound.SOUND_DRAW,
    summon: Sound.SOUND_SUMMON,
    special: Sound.SOUND_SPECIAL_SUMMON,
    flip: Sound.SOUND_FILP,
    position: Sound.SOUND_FILP,
    set: Sound.SOUND_SET,
    chain: Sound.SOUND_ACTIVATE,
    damage: Sound.SOUND_DAMAGE,
    recover: Sound.SOUND_RECOVER,
    turn: Sound.SOUND_NEXT_TURN,
    phase: Sound.SOUND_PHASE,
    confirm: Sound.SOUND_REVEAL,
  };
  let effect = effects[action.kind];
  if (action.kind === "attack")
    effect =
      action.to?.location === 0
        ? Sound.SOUND_DIRECT_ATTACK
        : Sound.SOUND_ATTACK;
  if (action.kind === "counter")
    effect =
      (action.counterDelta || 0) < 0
        ? Sound.SOUND_COUNTER_REMOVE
        : Sound.SOUND_COUNTER_ADD;
  if (action.kind === "move")
    effect =
      action.to?.location === 32
        ? Sound.SOUND_BANISHED
        : (action.reason || 0) & 1
        ? Sound.SOUND_DESTROYED
        : Sound.SOUND_CARD_DROP;
  return effect ? getEffectName(effect) : "";
}

/** One context per player, unlocked by a user gesture. Audio never drives Core. */
export class ReplayAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private sources = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private enabled = true;
  private volume = 0.7;
  private lastStarted = -Infinity;
  private listening = false;
  // Autoplay leaves the context suspended; any later tap or key resumes it,
  // not only Play / Step (clicking a card pauses, so that never helped).
  private readonly resumeOnGesture = () => {
    if (this.enabled && this.context && this.context.state !== "running")
      void this.context.resume().catch(() => {});
  };

  constructor(
    private readonly load: (name: string) => Promise<ArrayBuffer> = loadAudio,
  ) {}

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled && volume > 0;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gain) this.gain.gain.value = this.volume;
    if (!this.enabled) {
      this.stop();
      audioBlocked.replay = false;
    }
  }

  // Called synchronously inside Play / Step / Sound-on click handlers, before
  // any Worker or file-loading awaits (required by mobile autoplay policies).
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context || this.context.state === "closed") {
        const Audio =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!Audio) return;
        const context = new Audio();
        this.context = context;
        this.gain = context.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(context.destination);
        context.onstatechange = () => {
          if (this.context === context && context.state === "running")
            audioBlocked.replay = false;
        };
        this.listen(true);
      }
      if (this.context.state !== "running")
        void this.context.resume().catch(() => {});
    } catch {
      // Unsupported / denied audio must not prevent replay playback.
    }
  }

  play(action: SceneAction, speed: number) {
    const name = replaySound(action),
      context = this.context;
    if (!name || !this.enabled || !context) return;
    if (context.state !== "running") {
      // Skipped, never queued: show the tap-to-enable hint instead.
      audioBlocked.replay = true;
      return;
    }
    const generation = this.generation,
      requested = performance.now();
    let buffer = this.buffers.get(name);
    if (!buffer) {
      buffer = this.load(name).then((bytes) =>
        context.decodeAudioData(bytes.slice(0)),
      );
      this.buffers.set(name, buffer);
      void buffer.catch(() => {
        if (this.buffers.get(name) === buffer) this.buffers.delete(name);
        // A broken optional cache must not make every later decode fail.
        void removeAudio(name);
      });
    }
    void buffer
      .then((decoded) => {
        const now = performance.now();
        if (
          generation !== this.generation ||
          !this.enabled ||
          context.state !== "running" ||
          now - requested > Math.max(300, 600 / speed) ||
          (speed > 1 && now - this.lastStarted < 75)
        )
          return;
        // At 16x, do not accumulate dozens of overlapping voices or contexts.
        while (this.sources.size >= 4) {
          const oldest = this.sources.values().next()
            .value as AudioBufferSourceNode;
          oldest.stop();
          this.sources.delete(oldest);
        }
        const source = context.createBufferSource();
        source.buffer = decoded;
        source.connect(this.gain!);
        source.onended = () => {
          this.sources.delete(source);
          source.disconnect();
        };
        this.sources.add(source);
        this.lastStarted = now;
        source.start();
      })
      .catch(() => {});
  }

  private listen(on: boolean) {
    if (on === this.listening || typeof window.addEventListener !== "function")
      return;
    this.listening = on;
    for (const type of UNLOCK_GESTURES)
      if (on)
        window.addEventListener(type, this.resumeOnGesture, {
          capture: true,
          passive: true,
        });
      else
        window.removeEventListener(type, this.resumeOnGesture, {
          capture: true,
        });
  }

  stop() {
    this.generation++;
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.lastStarted = -Infinity;
  }

  dispose() {
    this.stop();
    this.listen(false);
    audioBlocked.replay = false;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined;
    this.gain = undefined;
    this.buffers.clear();
  }
}
