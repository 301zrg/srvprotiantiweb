import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

// eventbus.ts declares a TypeScript enum, which Node's type stripping cannot run; compile it first.
const compiled = await build({ entryPoints: ["src/infra/eventbus.ts"], bundle: true, write: false, platform: "node", format: "esm", external: ["eventemitter3"] });
const temp = resolve(".audit-tmp/duel-animation-unit-tests"); mkdirSync(temp, { recursive: true });
const modulePath = resolve(temp, "eventbus.mjs"); writeFileSync(modulePath, compiled.outputFiles[0].text);
const { eventbus, Task } = await import(pathToFileURL(modulePath));

test("unmounted cards do not block the protocol queue", { timeout: 1000 }, async () => {
  await eventbus.call(Task.Move, "not-mounted");
  await eventbus.call(Task.Focus, "not-mounted");
});

test("only the addressed card receives an animation", async () => {
  const calls = [];
  const disposeA = eventbus.register(Task.Move, "a", async value => calls.push(["a", value]));
  const disposeB = eventbus.register(Task.Move, "b", async value => calls.push(["b", value]));
  await eventbus.call(Task.Move, "b", 42);
  assert.deepEqual(calls, [["b", 42]]);
  disposeA();
  disposeB();
});

test("unmount releases in-flight tasks and removes the handler", { timeout: 1000 }, async () => {
  let calls = 0;
  const dispose = eventbus.register(Task.Attack, "unmount", () => {
    calls++;
    return new Promise(() => {});
  });
  const task = eventbus.call(Task.Attack, "unmount");
  dispose();
  await task;
  await eventbus.call(Task.Attack, "unmount");
  assert.equal(calls, 1);
});

test("a stale cleanup cannot unregister a remounted card", { timeout: 1000 }, async () => {
  const old = eventbus.register(Task.Focus, "remount", () => new Promise(() => {}));
  const pending = eventbus.call(Task.Focus, "remount");
  let calls = 0;
  const current = eventbus.register(Task.Focus, "remount", async () => calls++);
  old();
  old();
  await pending;
  await eventbus.call(Task.Focus, "remount");
  assert.equal(calls, 1);
  current();
});

test("handler errors are observable and do not poison later calls", async () => {
  let first = true;
  const dispose = eventbus.register(Task.Move, "error", async () => {
    if (first) {
      first = false;
      throw new Error("animation failed");
    }
  });
  await assert.rejects(eventbus.call(Task.Move, "error"), /animation failed/);
  await eventbus.call(Task.Move, "error");
  dispose();
});

test("concurrent animations of the same type finish independently", async () => {
  let finishA, finishB;
  const disposeA = eventbus.register(Task.Move, "parallel-a", () => new Promise(resolve => { finishA = resolve; }));
  const disposeB = eventbus.register(Task.Move, "parallel-b", () => new Promise(resolve => { finishB = resolve; }));
  const done = [];
  const a = eventbus.call(Task.Move, "parallel-a").then(() => done.push("a"));
  const b = eventbus.call(Task.Move, "parallel-b").then(() => done.push("b"));
  finishB();
  await b;
  assert.deepEqual(done, ["b"]);
  finishA();
  await a;
  assert.deepEqual(done, ["b", "a"]);
  disposeA();
  disposeB();
});

test("completed animation results are released while the card stays mounted", {
  skip: typeof global.gc !== "function" && "run with --expose-gc",
}, async () => {
  const dispose = eventbus.register(Task.Move, "retention", async value => value);
  const refs = [];
  try {
    await (async () => {
      for (let i = 0; i < 100; i++) {
        const value = { completedAnimation: i };
        refs.push(new WeakRef(value));
        await eventbus.call(Task.Move, "retention", value);
      }
    })();
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setImmediate(resolve));
      global.gc();
    }
    assert.equal(refs.filter(ref => ref.deref() !== undefined).length, 0);
  } finally {
    dispose();
  }
});
