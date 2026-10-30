// Online duel clocks: elapsed-time display, recalibration with an identical
// value, only the timed side counting, stop on response, new turn, SRVPro's
// zero heartbeat, spectators and reconnects.
import assert from "node:assert/strict";

import {
  calibrateClock,
  clockLeft,
  duelClock,
  forgetClock,
  hideClock,
  newTurnClock,
  resetClock,
  stopClock,
} from "../src/variant/duelClock.ts";

const t0 = 1_000_000;
resetClock(180, t0);
assert.equal(clockLeft(0, t0), 180);
assert.equal(clockLeft(1, t0), 180);
assert.equal(duelClock.running, null);

// Player 0 is timed; player 1 keeps its value.
calibrateClock(0, 180, t0);
assert.equal(clockLeft(0, t0 + 5_000), 175);
assert.equal(clockLeft(1, t0 + 5_000), 180, "only the timed side counts");
// A missed minute of callbacks does not matter: the display uses elapsed time.
assert.equal(clockLeft(0, t0 + 65_000), 115);
// The same 180 arriving again recalibrates (the old effect ignored it).
const seq = duelClock.seq;
calibrateClock(0, 180, t0 + 10_000);
assert.ok(duelClock.seq > seq);
assert.equal(clockLeft(0, t0 + 10_000), 180);

// Our response stops the countdown; the value is kept.
stopClock(t0 + 13_000);
assert.equal(duelClock.running, null);
assert.equal(clockLeft(0, t0 + 60_000), 177);

// The opponent responds to an effect in our turn: their clock is timed and
// shown, ours frozen.
calibrateClock(1, 150, t0 + 20_000);
assert.equal(duelClock.running, 1);
assert.equal(clockLeft(1, t0 + 30_000), 140);
assert.equal(clockLeft(0, t0 + 30_000), 177);

// SRVPro's heartbeat sends 0 for both players: not a calibration.
calibrateClock(0, 0, t0 + 31_000);
calibrateClock(1, 0, t0 + 31_000);
assert.equal(duelClock.running, 1);
assert.equal(clockLeft(1, t0 + 31_000), 139);

// New turn: the server restores both clocks to the room limit.
newTurnClock(t0 + 40_000);
assert.equal(clockLeft(0, t0 + 40_000), 180);
assert.equal(clockLeft(1, t0 + 40_000), 180);
assert.equal(duelClock.running, null);

// Never below zero; other limits keep their own scale.
calibrateClock(1, 3, t0 + 50_000);
assert.equal(clockLeft(1, t0 + 60_000), 0);
resetClock(300, t0);
assert.equal(duelClock.limit, 300);
assert.equal(clockLeft(0, t0), 300);

// Reconnect: earlier values are hidden until the server recalibrates.
forgetClock();
assert.equal(clockLeft(0, t0), undefined);
calibrateClock(0, 90, t0 + 1_000);
assert.equal(clockLeft(0, t0 + 1_000), 90);
assert.equal(clockLeft(1, t0 + 1_000), undefined);

// Spectators and rooms without a limit show no clock and ignore packets.
hideClock();
calibrateClock(0, 120, t0);
assert.equal(clockLeft(0, t0), undefined);
resetClock(0, t0);
assert.equal(clockLeft(0, t0), undefined);
console.log(
  "Duel clock: elapsed display, identical recalibration, timed side only, stop, opponent response, heartbeat zero, new turn, reconnect and spectators passed.",
);
