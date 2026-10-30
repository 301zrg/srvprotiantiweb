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
  assert.equal(fresh.replaySpeed, 1, "Fresh replay speed is 1x");
  assert.equal(fresh.replayAutoPlay, true, "New replays start automatically by default");
  assert.equal(fresh.controlPanelSide, "left", "All control panels start on the left");
  assert.equal(fresh.showZoneCounts, true, "Zone counts are visible by default");
  assert.equal(fresh.hidePlayerIds, false, "Player IDs remain visible by default");
  assert.equal(fresh.serverMessageMode, "auto", "A fresh user needs adaptive message display");
  assert.equal(fresh.randomRpsMode, "suggest", "Random suggestions must never submit by default");
  assert.equal(fresh.chainSetting, 2, "A fresh user keeps smart chain timing");
  assert.equal(fresh.historyStyle, "auto", "The log picks text on phones and cards on computers");
  assert.equal(fresh.chatOrder, "history", "Duel chat follows the action log order by default");
  assert.equal(fresh.spectatorKeepSeat, true, "Spectators keep their side after siding by default");
  assert.equal(fresh.showZoneIndexes, true, "Zone numbers are shown by default");

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
  configured.showZoneCounts = false;
  configured.hidePlayerIds = true;
  configured.replaySpeed = 4;
  configured.replayAutoPlay = false;
  configured.controlPanelSide = "right";
  configured.historyStyle = "text";
  configured.chatOrder = "newest";
  configured.spectatorKeepSeat = false;
  await new Promise(resolve => setTimeout(resolve, 0));
  const reopened = await load(JSON.parse(saved));
  assert.equal(reopened.audio.enableSoundEffects, false, "Main mute must survive reopening the browser");
  assert.equal(reopened.chainSetting, 1, "Chain shortcut changes must survive reopening");
  assert.equal(reopened.serverMessageMode, "record");
  assert.equal(reopened.showZoneCounts, false, "Hiding zone badges persists after reopening");
  assert.equal(reopened.hidePlayerIds, true, "ID masking persists after reopening");
  assert.equal(reopened.replaySpeed, 4, "Replay speed survives reopening");
  assert.equal(reopened.replayAutoPlay, false, "Explicit autoplay opt-out survives reopening");
  assert.equal(reopened.controlPanelSide, "right", "Panel side survives reopening");
  assert.equal(reopened.historyStyle, "text", "Log style survives reopening");
  assert.equal(reopened.chatOrder, "newest", "Chat order survives reopening");
  assert.equal(reopened.spectatorKeepSeat, false, "Spectator seat opt-out survives reopening");

  const damaged = await load({ chainSetting: 99, randomRpsMode: "auto-send", serverMessageMode: "bad", audio: { enableSoundEffects: "true", soundEffectsVolume: 90 } });
  assert.equal(damaged.chainSetting, 2);
  assert.equal(damaged.randomRpsMode, "suggest");
  assert.equal(damaged.serverMessageMode, "auto");
  assert.equal(damaged.audio.enableSoundEffects, false);
  assert.equal(damaged.audio.soundEffectsVolume, 1);
  const invalidSide = await load({ controlPanelSide: "bottom", historyStyle: "cards", chatOrder: "random", spectatorKeepSeat: "no" });
  assert.equal(invalidSide.controlPanelSide, "left");
  assert.equal(invalidSide.historyStyle, "auto");
  assert.equal(invalidSide.chatOrder, "history");
  assert.equal(invalidSide.spectatorKeepSeat, true);
  for (const replaySpeed of [0, -1, 3, "2", null]) {
    const invalidReplay = await load({ replaySpeed, replayAutoPlay: "false" });
    assert.equal(invalidReplay.replaySpeed, 1);
    assert.equal(invalidReplay.replayAutoPlay, true);
  }
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
