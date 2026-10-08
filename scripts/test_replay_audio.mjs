import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
try {
  globalThis.window = {};
  globalThis.localStorage = {
    getItem: (key) => (key === "language" ? "cn" : null),
  };
  const { ReplayAudio, replaySound } = await server.ssrLoadModule(
    "/src/ui/Replay/audio.ts",
  );
  const contexts = [];
  class Audio {
    state = "running";
    destination = {};
    gain = { gain: { value: 1 }, connect() {} };
    sources = [];
    constructor() {
      contexts.push(this);
    }
    createGain() {
      return this.gain;
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
    decodeAudioData() {
      return Promise.resolve({ length: 8 });
    }
    createBufferSource() {
      const source = {
        started: false,
        stopped: false,
        connect() {},
        disconnect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      this.sources.push(source);
      return source;
    }
  }
  globalThis.window = { AudioContext: Audio };
  let complete;
  const delayed = new ReplayAudio(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  delayed.configure(true, 0.25);
  delayed.unlock();
  assert.equal(contexts[0].gain.gain.value, 0.25);
  delayed.play({ kind: "draw" }, 1);
  delayed.stop();
  complete(new ArrayBuffer(8));
  await flush();
  assert.equal(
    contexts[0].sources.length,
    0,
    "A late download must not play after pause / seek / exit",
  );
  delayed.play({ kind: "draw" }, 1);
  await flush();
  assert.equal(
    contexts[0].sources.length,
    1,
    "A resumed action can reuse the decoded cache",
  );
  delayed.configure(false, 0.25);
  assert.ok(contexts[0].sources.every((source) => source.stopped));
  delayed.play({ kind: "draw" }, 1);
  await flush();
  assert.equal(contexts[0].sources.length, 1, "Mute must prevent new sounds");
  delayed.dispose();
  assert.equal(contexts[0].state, "closed");
  let attempts = 0;
  const retry = new ReplayAudio(async () => {
    if (++attempts === 1) throw new Error("offline optional WAV");
    return new ArrayBuffer(8);
  });
  retry.unlock();
  retry.play({ kind: "summon" }, 1);
  await flush();
  assert.equal(contexts[1].sources.length, 0);
  retry.play({ kind: "summon" }, 1);
  await flush();
  assert.equal(
    contexts[1].sources.length,
    1,
    "Failed optional audio must be retryable without breaking playback",
  );
  for (let i = 0; i < 10; i++) {
    retry.play({ kind: "summon" }, 1);
    await flush();
  }
  assert.ok(
    contexts[1].sources.filter((source) => !source.stopped).length <= 4,
  );
  retry.stop();
  const before = contexts[1].sources.length;
  for (let i = 0; i < 10; i++) retry.play({ kind: "summon" }, 16);
  await flush();
  assert.equal(
    contexts[1].sources.length,
    before + 1,
    "16x simultaneous cues must be throttled",
  );
  retry.dispose();
  globalThis.window = {};
  const unsupported = new ReplayAudio(async () => {
    throw new Error("Must not fetch");
  });
  unsupported.unlock();
  unsupported.play({ kind: "draw" }, 1);
  unsupported.dispose();
  assert.equal(
    replaySound({ kind: "counter", counterDelta: -2 }),
    "removecounter.wav",
  );
  assert.equal(
    replaySound({ kind: "counter", counterDelta: 2 }),
    "addcounter.wav",
  );
  assert.equal(
    replaySound({ kind: "attack", to: { location: 0 } }),
    "directattack.wav",
  );
  assert.equal(
    replaySound({ kind: "move", to: { location: 32 } }),
    "banished.wav",
  );
  assert.equal(replaySound({ kind: "move", reason: 1 }), "destroyed.wav");
  assert.equal(replaySound({ kind: "chainEnd" }), "");
  console.log(
    "Replay audio: late-load cancellation, volume, mute, retry, bounded voices, 16x throttle, unsupported browser and cue mapping passed.",
  );
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  await server.close();
}
