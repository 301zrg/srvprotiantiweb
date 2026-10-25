import { EventEmitter } from "eventemitter3";

const eventEmitter = new EventEmitter();

export enum Task {
  Move = "move", // 卡片移动
  Focus = "focus", // 卡片聚焦
  Attack = "attack", // 卡片攻击
  Mora = "mora", // 猜拳
  Tp = "tp", // 选边
}

interface AnimationHandler {
  run: (...args: any[]) => Promise<unknown>;
  pending: Set<() => void>;
  dispose: () => void;
}

const animations = new Map<Task, Map<string, AnimationHandler>>();

/** A mounted card owns its animations and releases pending calls on unmount. */
const register = <T extends unknown[]>(
  task: Task,
  target: string,
  fn: (...args: T) => Promise<unknown>,
) => {
  const handlers = animations.get(task) ?? new Map<string, AnimationHandler>();
  animations.set(task, handlers);
  const pending = new Set<() => void>();
  const owner: AnimationHandler = {
    run: (...args) => fn(...(args as T)),
    pending,
    dispose: () => {
      for (const finish of pending) finish();
    },
  };
  handlers.get(target)?.dispose();
  handlers.set(target, owner);
  return () => {
    owner.dispose();
    if (handlers.get(target) === owner) handlers.delete(target);
    if (!handlers.size && animations.get(task) === handlers)
      animations.delete(task);
  };
};

/** Missing cards need no animation: their mount reads the latest field state. */
const call = async (task: Task, target: string, ...args: any[]) => {
  const handler = animations.get(task)?.get(target);
  if (!handler) return;
  // A shared, never-settled disposal Promise would retain a reaction for every
  // completed animation until unmount. Keep only calls that are still pending.
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      handler.pending.delete(finish);
      resolve();
    };
    const fail = (error: unknown) => {
      handler.pending.delete(finish);
      reject(error);
    };
    handler.pending.add(finish);
    try {
      Promise.resolve(handler.run(...args)).then(finish, fail);
    } catch (error) {
      fail(error);
    }
  });
};

export const eventbus = {
  call,
  register,
  on: eventEmitter.on.bind(eventEmitter),
  off: eventEmitter.off.bind(eventEmitter),
  once: eventEmitter.once.bind(eventEmitter),
  emit: eventEmitter.emit.bind(eventEmitter),
};
