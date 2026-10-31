// Exercise online playback through the same canonical setting used by replay.
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true, watch: null }, optimizeDeps: { disabled: true }, logLevel: "error" });
const original = { window: globalThis.window, localStorage: globalThis.localStorage, AudioContext: globalThis.AudioContext, document: globalThis.document, fetch: globalThis.fetch };
const contexts = [];
const flush = () => new Promise(resolve => setTimeout(resolve, 30));
class Audio {
  state = "running";
  destination = {};
  currentTime = 1;
  gain = { gain: { value: 1 }, connect() { return this; } };
  sources = [];
  constructor() { contexts.push(this); }
  createGain() { return this.gain; }
  createBufferSource() {
    const source = { context: this, started: false, stopped: false, connect() { return this.context.gain; }, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; }, addEventListener() {}, removeEventListener() {} };
    this.sources.push(source);
    return source;
  }
  decodeAudioData() { return Promise.resolve({}); }
  close() { this.state = "closed"; return Promise.resolve(); }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}
// The effect manager registers tap/click/key listeners that resume a suspended context.
globalThis.window = { navigator: { userAgent: "online-audio-regression" }, location: { href: "http://127.0.0.1/", pathname: "/" }, AudioContext: Audio, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = { getItem: key => key === "language" ? "cn" : null, setItem() {} };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.AudioContext = Audio;
let finishFetch;
let delayFetch = false;
globalThis.fetch = async () => ({ ok: true, arrayBuffer: () => delayFetch
  ? new Promise(resolve => { finishFetch = () => resolve(new ArrayBuffer(8)); })
  : Promise.resolve(new ArrayBuffer(8)) });
const waitForFetch = async () => {
  for (let i = 0; i < 100 && !finishFetch; i++) await flush();
  assert.ok(finishFetch, "The controlled sound download must reach the network fixture");
};
try {
  const { settingStore } = await server.ssrLoadModule("/src/stores/settingStore/index.ts");
  const { playEffect } = await server.ssrLoadModule("/src/infra/audio/effect/index.ts");
  settingStore.saveAudioConfig({ enableSoundEffects: true, soundEffectsVolume: 0.25 });
  // Warm-up: Vite transforms the audio cache modules on first use, and an effect whose
  // first load takes over 600 ms is skipped by design. The decoded buffer is then cached.
  await playEffect(101);
  // Online effects share one gesture-unlocked context (2026-10-31): muting stops the
  // active sources and cancels pending loads instead of closing a context per effect.
  const shared = contexts[0], started = () => shared.sources.filter(source => source.started).length;
  const before = started();
  await playEffect(101);
  assert.equal(contexts.length, 1, "Effects share a single audio context");
  assert.equal(shared.gain.gain.value, 0.25);
  assert.equal(started(), before + 1);
  const active = shared.sources.at(-1);
  settingStore.saveAudioConfig({ enableSoundEffects: false });
  await flush();
  assert.equal(active.stopped, true, "Muting must immediately stop an already playing online effect");
  const muted = started();
  await playEffect(101);
  assert.equal(contexts.length, 1, "Muted playback must not create another audio context");
  assert.equal(started(), muted, "Muted playback must not start a source");

  settingStore.saveAudioConfig({ enableSoundEffects: true, soundEffectsVolume: 0.5 });
  delayFetch = true;
  const pending = playEffect(205);
  await waitForFetch();
  settingStore.audio.enableSoundEffects = false;
  await flush();
  finishFetch();
  await pending;
  assert.equal(started(), muted, "Late downloads must not restart an effect after mute");

  settingStore.audio.enableSoundEffects = true;
  finishFetch = undefined;
  const resumed = playEffect(203);
  await waitForFetch();
  settingStore.audio.soundEffectsVolume = 0.4;
  await flush();
  finishFetch();
  await resumed;
  assert.equal(contexts.length, 1);
  assert.equal(shared.gain.gain.value, 0.4, "Changing the shared volume also updates currently loading effects");
  settingStore.audio.enableSoundEffects = false;
  console.log("Online audio: canonical mute, immediate active stop, pending-load cancellation and live volume passed.");
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
  await server.close();
}
