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
    const source = { context: this, started: false, connect() { return this.context.gain; }, start() { this.started = true; }, addEventListener() {}, removeEventListener() {} };
    this.sources.push(source);
    return source;
  }
  decodeAudioData() { return Promise.resolve({}); }
  close() { this.state = "closed"; return Promise.resolve(); }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
}
globalThis.window = { navigator: { userAgent: "online-audio-regression" }, location: { href: "http://127.0.0.1/", pathname: "/" } };
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
  const playing = playEffect(101);
  await playing;
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].gain.gain.value, 0.25);
  assert.equal(contexts[0].sources[0].started, true);
  settingStore.saveAudioConfig({ enableSoundEffects: false });
  assert.equal(contexts[0].state, "closed", "Muting must immediately stop an already playing online effect");
  await playEffect(101);
  assert.equal(contexts.length, 1, "Muted playback must not create another audio context");

  settingStore.saveAudioConfig({ enableSoundEffects: true, soundEffectsVolume: 0.5 });
  delayFetch = true;
  const pending = playEffect(205);
  await waitForFetch();
  settingStore.audio.enableSoundEffects = false;
  finishFetch();
  await pending;
  assert.equal(contexts[1].state, "closed");
  assert.equal(contexts[1].sources.filter(source => source.started).length, 0, "Late downloads must not restart an effect after mute");

  settingStore.audio.enableSoundEffects = true;
  finishFetch = undefined;
  const resumed = playEffect(203);
  await waitForFetch();
  settingStore.audio.soundEffectsVolume = 0.4;
  finishFetch();
  await resumed;
  assert.equal(contexts[2].gain.gain.value, 0.4, "Changing the shared volume also updates currently loading effects");
  settingStore.audio.enableSoundEffects = false;
  console.log("Online audio: canonical mute, immediate active stop, pending-load cancellation and live volume passed.");
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
  await server.close();
}
