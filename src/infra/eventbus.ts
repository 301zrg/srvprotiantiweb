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
  disposed: Promise<void>;
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
  let dispose!: () => void;
  const disposed = new Promise<void>((resolve) => (dispose = resolve));
  const owner: AnimationHandler = {
    run: (...args) => fn(...(args as T)),
    disposed,
    dispose,
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
  await Promise.race([handler.run(...args), handler.disposed]);
};

export const eventbus = {
  call,
  register,
  on: eventEmitter.on.bind(eventEmitter),
  off: eventEmitter.off.bind(eventEmitter),
  once: eventEmitter.once.bind(eventEmitter),
  emit: eventEmitter.emit.bind(eventEmitter),
};
