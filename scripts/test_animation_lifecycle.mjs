// Exercise real animation/presentation code with controlled spring engine failures.
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const folder = resolve(".audit-tmp/animation-stability/tests");
mkdirSync(folder, { recursive: true });
const compiled = await build({
  stdin: {
    contents: `
      export { asyncStart } from "./src/ui/Duel/PlayMat/Card/springs/utils.ts";
      export { focus } from "./src/ui/Duel/PlayMat/Card/springs/focus.ts";
      export { default as shuffle } from "./src/service/duel/shuffleSetCard.ts";
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  tsconfig: "tsconfig.json",
  define: { "import.meta.env.DEV": "false" },
  plugins: [
    {
      name: "animation-boundaries",
      setup(builder) {
        const stubs = {
          "@/container/compat":
            "export const getUIContainer = () => globalThis.animationContainer;",
          "@/stores/settingStore":
            "export const settingStore = { animation: { speed: 1 } };",
          "@/stores": "export const matStore = { isMe: () => true };",
          "@/api":
            "export const ygopro = { CardZone: { HAND: 2, DECK: 1, EXTRA: 64 } };",
          "@/infra/audio":
            "export const AudioActionType = {}; export const playEffect = () => {};",
          "@/ui/Duel/PlayMat/Card":
            "export const callCardMove = (...args) => globalThis.animateOverlay(...args);",
        };
        builder.onResolve({ filter: /^@\// }, (args) =>
          args.path in stubs
            ? { path: args.path, namespace: "boundary" }
            : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => ({
          contents: stubs[args.path],
          loader: "js",
        }));
      },
    },
  ],
});
const output = resolve(folder, "animation.mjs");
writeFileSync(output, compiled.outputFiles[0].text);
const { asyncStart, focus, shuffle } = await import(pathToFileURL(output));

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture() {
  const connection = new AbortController();
  globalThis.animationContainer = { conn: { signal: connection.signal } };
  globalThis.document = Object.assign(new EventTarget(), { hidden: false });
  const api = {
    starts: [],
    sets: [],
    stops: 0,
    start(values) {
      this.starts.push(values);
      return [new Promise(() => {})];
    },
    stop() {
      this.stops++;
    },
    set(values) {
      this.sets.push(values);
    },
    pause() {},
    resume() {},
    current: [{ get: () => ({ x: 0, y: 0, z: 0 }) }],
  };
  return { api, connection };
}

test("engine throw/rejection snaps the step and permits the next animation", async () => {
  for (const asynchronous of [false, true]) {
    const { api } = fixture();
    let first = true;
    api.start = (values) => {
      api.starts.push(values);
      if (first) {
        first = false;
        if (asynchronous) return [Promise.reject(new Error("engine failure"))];
        throw new Error("engine failure");
      }
      return [Promise.resolve()];
    };
    await assert.doesNotReject(
      asyncStart(api)({ x: 42, config: { duration: 100 } }),
    );
    assert.deepEqual(api.sets, [{ x: 42 }]);
    await asyncStart(api)({ x: 84 });
    assert.equal(api.starts.length, 2);
    assert.equal(getEventListeners(document, "visibilitychange").length, 0);
  }
});

test("explicit mount cancellation releases a background wait", async () => {
  const { api, connection } = fixture();
  const mount = new AbortController();
  document.hidden = true;
  let done = false;
  const task = asyncStart(
    api,
    mount.signal,
  )({ x: 42 }).then(() => {
    done = true;
  });
  mount.abort();
  await flush();
  const cancelled = done;
  // Always release a broken implementation's original connection too.
  connection.abort();
  await task;
  assert.equal(cancelled, true);
  assert.equal(getEventListeners(document, "visibilitychange").length, 0);
  assert.equal(api.starts.length, 0);
});

test("a cancelled multi-stage focus cannot start again on a new connection", async () => {
  const { api, connection } = fixture();
  const first = deferred();
  api.start = (values) => {
    api.starts.push(values);
    return [first.promise];
  };
  const task = focus({
    card: { location: { zone: 2, controller: 0 } },
    api,
    signal: connection.signal,
  });
  await flush();
  const replacement = new AbortController();
  globalThis.animationContainer = { conn: { signal: replacement.signal } };
  connection.abort();
  first.resolve();
  await flush();
  const starts = api.starts.length;
  replacement.abort();
  await task;
  assert.equal(starts, 1, "old focus resumed on the replacement connection");
  assert.equal(getEventListeners(document, "visibilitychange").length, 0);
});

test("a failed terminal-state update rejects instead of hanging the queue", async (t) => {
  const { api } = fixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  api.set = () => {
    throw new Error("terminal state failed");
  };
  const task = asyncStart(api)({ x: 42 });
  const result = task.then(
    () => "resolved",
    (error) => error.message,
  );
  await flush();
  assert.doesNotThrow(() => t.mock.timers.tick(3000));
  assert.equal(await result, "terminal state failed");
  assert.equal(getEventListeners(document, "visibilitychange").length, 0);
});

test("all spring controllers finish before the step releases", async () => {
  const { api } = fixture();
  const a = deferred(),
    b = deferred();
  api.start = (values) => {
    a.promise.then(() => values.onResolve?.());
    return [a.promise, b.promise];
  };
  let done = false;
  const task = asyncStart(api)({ x: 42 }).then(() => {
    done = true;
  });
  await flush();
  a.resolve();
  await flush();
  const early = done;
  b.resolve();
  await task;
  assert.equal(early, false);
});

test("foreground deadline snaps a stalled step and removes its listeners", async (t) => {
  const { api, connection } = fixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const task = asyncStart(api)({ x: 42, config: { duration: 100 } });
  await flush();
  t.mock.timers.tick(3000);
  await task;
  assert.deepEqual(api.sets, [{ x: 42 }]);
  assert.equal(getEventListeners(document, "visibilitychange").length, 0);
  assert.equal(getEventListeners(connection.signal, "abort").length, 0);
});

test("background suspension preserves history until foreground resumes", async (t) => {
  const { api, connection } = fixture();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let done = false;
  const task = asyncStart(api)({ x: 42 }).then(() => {
    done = true;
  });
  await flush();
  document.hidden = true;
  document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(done, false);
  assert.deepEqual(api.sets, []);
  document.hidden = false;
  document.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(3000);
  await task;
  assert.deepEqual(api.sets, [{ x: 42 }]);
  assert.equal(getEventListeners(connection.signal, "abort").length, 0);
});

test("unmount cancels an in-progress reveal hold without restarting its return stage", async () => {
  const { api, connection } = fixture();
  const dismiss = new AbortController();
  api.start = (values) => {
    api.starts.push(values);
    return [Promise.resolve()];
  };
  let done = false;
  const task = focus({
    card: { location: { zone: 2, controller: 0 } },
    api,
    signal: connection.signal,
    options: { holdMs: 10000, signal: dismiss.signal },
  }).then(() => {
    done = true;
  });
  await flush();
  connection.abort();
  await flush();
  const cancelled = done;
  dismiss.abort();
  await task;
  assert.equal(cancelled, true);
  assert.equal(api.starts.length, 1);
  assert.equal(getEventListeners(document, "visibilitychange").length, 0);
});

test("a reveal hold can still be dismissed while its card remains mounted", async () => {
  const { api, connection } = fixture();
  const dismiss = new AbortController();
  api.start = (values) => {
    api.starts.push(values);
    return [Promise.resolve()];
  };
  const task = focus({
    card: { location: { zone: 2, controller: 0 } },
    api,
    signal: connection.signal,
    options: { holdMs: 10000, signal: dismiss.signal },
  });
  await flush();
  dismiss.abort();
  await task;
  assert.equal(api.starts.length, 2);
  assert.equal(connection.signal.aborted, false);
  assert.equal(getEventListeners(dismiss.signal, "abort").length, 0);
});

test("shuffle waits for all overlay moves before the next protocol message", async () => {
  const move = deferred();
  globalThis.animateOverlay = () => move.promise;
  const overlay = { uuid: "overlay", location: { sequence: 0 } };
  const target = { code: 1, meta: { id: 1, text: { id: 1 } } };
  const trace = [];
  const task = shuffle(
    {
      context: {
        cardStore: {
          at: () => target,
          findOverlay: () => [overlay],
        },
      },
    },
    {
      from_locations: [{ zone: 4, controller: 0, sequence: 0 }],
      overlay_locations: [{ zone: 4, sequence: 1 }],
    },
  ).then(() => trace.push("next packet"));
  await flush();
  const early = [...trace];
  move.resolve();
  await task;
  assert.deepEqual(early, []);
  assert.deepEqual(trace, ["next packet"]);
  assert.equal(overlay.location.sequence, 1);
});
