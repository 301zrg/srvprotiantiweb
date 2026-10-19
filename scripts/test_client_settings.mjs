// Settings migrations exercise persisted user choices, including old muted users.
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
let saved;
let caseId = 0;
globalThis.window = { navigator: { userAgent: "settings-regression" } };
globalThis.localStorage = {
  getItem: () => saved,
  setItem: (_key, value) => { saved = value; },
};
const load = async (config) => {
  saved = config === undefined ? null : JSON.stringify(config);
  const { settingStore } = await server.ssrLoadModule(`/src/stores/settingStore/index.ts?settings-case=${++caseId}`);
  return settingStore;
};
try {
  const fresh = await load();
  assert.equal(fresh.serverMessageMode, "auto", "A fresh user needs adaptive message display");
  assert.equal(fresh.randomRpsMode, "suggest", "Random suggestions must never submit by default");
  assert.equal(fresh.chainSetting, 2, "A fresh user keeps smart chain timing");

  const muted = await load({ audio: { enableSoundEffects: false, enableReplaySoundEffects: true }, showServerMessages: false });
  assert.equal(muted.audio.enableSoundEffects, false, "Legacy replay preference must not unmute the main sound setting");
  assert.equal(muted.serverMessageMode, "record", "The old disabled-popup setting must remain disabled");
  assert.equal(muted.audio.soundEffectsVolume, 0.7, "Partial legacy audio settings need a usable volume");
  assert.equal("enableReplaySoundEffects" in muted.audio, false, "There must be one sound-effects authority");

  const configured = await load({ chainSetting: 0, randomRpsMode: "play", serverMessageMode: "popup", audio: { enableSoundEffects: true, soundEffectsVolume: 0.25 } });
  assert.equal(configured.chainSetting, 0);
  assert.equal(configured.randomRpsMode, "play");
  assert.equal(configured.serverMessageMode, "popup");
  configured.saveAudioConfig({ enableSoundEffects: false });
  configured.chainSetting = 1;
  configured.serverMessageMode = "record";
  await new Promise(resolve => setTimeout(resolve, 0));
  const reopened = await load(JSON.parse(saved));
  assert.equal(reopened.audio.enableSoundEffects, false, "Main mute must survive reopening the browser");
  assert.equal(reopened.chainSetting, 1, "Chain shortcut changes must survive reopening");
  assert.equal(reopened.serverMessageMode, "record");

  const damaged = await load({ chainSetting: 99, randomRpsMode: "auto-send", serverMessageMode: "bad", audio: { enableSoundEffects: "true", soundEffectsVolume: 90 } });
  assert.equal(damaged.chainSetting, 2);
  assert.equal(damaged.randomRpsMode, "suggest");
  assert.equal(damaged.serverMessageMode, "auto");
  assert.equal(damaged.audio.enableSoundEffects, false);
  assert.equal(damaged.audio.soundEffectsVolume, 1);
  globalThis.localStorage.getItem = () => { throw new Error("Storage blocked"); };
  const { settingStore: blocked } = await server.ssrLoadModule("/src/stores/settingStore/index.ts?storage-blocked");
  assert.equal(blocked.randomRpsMode, "suggest");
  console.log("Client settings: defaults, legacy mute/message migration, partial audio, persistence, damaged values and blocked storage passed.");
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  await server.close();
}
