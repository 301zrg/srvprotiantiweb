import { proxy } from "valtio";

/** Online duel clocks, as YGOPro's time_left / time_player.
 *
 * Each side holds the seconds the server reported and the wall-clock time the
 * packet arrived; only the side the server is waiting for counts down, and the
 * display is derived from elapsed time rather than from timer callbacks, so a
 * throttled background tab or a busy main thread cannot drift it. */
export interface ClockSide {
  /** Seconds left at `at`; negative when unknown. */
  left: number;
  /** Date.now() of the calibration (packet arrival). */
  at: number;
}

export const duelClock = proxy({
  /** Room time limit in seconds; 0 hides the clocks (no limit, spectating). */
  limit: 0,
  /** Indexed by Core controller. */
  sides: [
    { left: -1, at: 0 },
    { left: -1, at: 0 },
  ] as ClockSide[],
  /** Controller whose response the server is timing, if any. */
  running: null as 0 | 1 | null,
  /** Bumped on every calibration, including a repeated identical value. */
  seq: 0,
});

/** New game (MSG_START) or reconnect: both sides full, nobody counting. */
export function resetClock(limit: number, now = Date.now()) {
  duelClock.limit = limit > 0 ? limit : 0;
  for (const side of duelClock.sides) {
    side.left = duelClock.limit || -1;
    side.at = now;
  }
  duelClock.running = null;
  duelClock.seq++;
}

/** The server restores both clocks to the room limit at every new turn. */
export function newTurnClock(now = Date.now()) {
  if (!duelClock.limit) return;
  stopClock(now);
  for (const side of duelClock.sides) {
    side.left = duelClock.limit;
    side.at = now;
  }
  duelClock.seq++;
}

/** STOC_TIME_LIMIT: the server now waits for `controller`. Zero is not used:
 * SRVPro's heartbeat probe sends 0 for both players, and a real timeout ends
 * the duel from the server anyway. */
export function calibrateClock(controller: number, left: number, at: number) {
  if (!duelClock.limit || (controller !== 0 && controller !== 1) || left <= 0)
    return;
  stopClock(at);
  duelClock.sides[controller].left = left;
  duelClock.sides[controller].at = at;
  duelClock.running = controller;
  duelClock.seq++;
}

/** A response left this client (or a new calibration): freeze the counter. */
export function stopClock(now = Date.now()) {
  const running = duelClock.running;
  if (running === null) return;
  const side = duelClock.sides[running];
  if (side.left >= 0)
    side.left = Math.max(0, side.left - (now - side.at) / 1000);
  side.at = now;
  duelClock.running = null;
}

/** Spectators receive no TIME_LIMIT: show no clock rather than a fake one. */
export function hideClock() {
  duelClock.limit = 0;
  duelClock.running = null;
  duelClock.seq++;
}

/** Reconnected: earlier values are stale; show nothing until recalibrated. */
export function forgetClock() {
  for (const side of duelClock.sides) side.left = -1;
  duelClock.running = null;
  duelClock.seq++;
}

/** Whole seconds left for a controller, or undefined when not shown. */
export function clockLeft(controller: number, now = Date.now()) {
  const side = duelClock.sides[controller];
  if (!duelClock.limit || !side || side.left < 0) return undefined;
  if (duelClock.running !== controller) return Math.ceil(side.left);
  return Math.max(0, Math.ceil(side.left - (now - side.at) / 1000));
}
