// Online sound effects on iOS: a suspended context must drop effects, not queue
// them for one burst on the next tap; one shared context, capped voices.
import assert from "node:assert/strict";
import { createServer } from "vite";

const contexts = [];
const listeners = new Map();
class FakeContext {
  constructor() {
    this.state = "suspended";
    this.started = [];
    this.destination = {};
    contexts.push(this);
  }
  createGain() {
    return { gain: { value: 1 }, connect() {} };
  }
  async decodeAudioData() {
    return { duration: 0.2 };
  }
  createBufferSource() {
    const context = this;
    return {
      connect() {},
      disconnect() {},
      start() {
        context.started.push(this);
      },
      stop() {
        this.stopped = true;
      },
    };
  }
  resume() {
    this.resumeCalls = (this.resumeCalls || 0) + 1;
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}
globalThis.window = {
  AudioContext: FakeContext,
  addEventListener: (type, handler) => listeners.set(type, handler),
  navigator: { userAgent: "audio-regression" },
  location: { href: "http://localhost/" },
};
globalThis.AudioContext = FakeContext;
globalThis.fetch = async () => ({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(8),
});
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { audioContextManger: audio } = await server.ssrLoadModule(
    "/src/infra/audio/core/manager.ts",
  );
  const { AudioActionType } = await server.ssrLoadModule(
    "/src/infra/audio/type.ts",
  );
  const effect = AudioActionType.SOUND_SUMMON;
  // A tap before any online effect creates nothing.
  audio.effectsWanted = true;
  listeners.get("click")();
  assert.equal(contexts.length, 0, "a tap alone creates no audio context");
  audio.effectsWanted = false;
  // Before any gesture (spectating without touching the screen): nothing plays
  // and no per-effect contexts pile up.
  for (let i = 0; i < 20; i++) await audio.playEffect(effect, 0.5);
  assert.equal(
    contexts.length,
    1,
    "one shared effect context, not one per effect",
  );
  assert.equal(
    contexts[0].started.length,
    0,
    "suspended context drops effects",
  );
  // Gestures only unlock when sound effects are on, and never create a
  // context by themselves (replays must not get an online context).
  listeners.get("pointerdown")();
  const callsWhileOff = contexts[0].resumeCalls;
  audio.effectsWanted = true;
  listeners.get("touchend")();
  assert.ok(
    contexts[0].resumeCalls > callsWhileOff,
    "a tap resumes the shared context",
  );
  contexts[0].state = "running";
  // The 20 earlier requests must not play now (that was the burst).
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(
    contexts[0].started.length,
    0,
    "no backlog plays after unlocking",
  );
  await audio.playEffect(effect, 0.5);
  assert.equal(
    contexts[0].started.length,
    1,
    "a new effect plays once unlocked",
  );
  // A burst keeps at most six voices.
  for (let i = 0; i < 10; i++) await audio.playEffect(effect, 0.5);
  assert.equal(contexts[0].started.length, 11);
  assert.ok(
    contexts[0].started.filter((source) => !source.stopped).length <= 6,
    "voices are capped",
  );
  audio.stopEffects();
  assert.ok(
    contexts[0].started.every((source) => source.stopped),
    "muting stops every voice",
  );
  assert.equal(contexts.length, 1);
  console.log(
    "Effect audio: shared context, suspended drops, gesture unlock, no backlog burst, voice cap and stop passed.",
  );
} finally {
  await server.close();
}
