import assert from "node:assert/strict";
import { test } from "node:test";

import { eventbus, Task } from "../src/infra/eventbus.ts";

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
