// Spectator side across games: MSG_START's swap flag changes which Core player
// is the first, never which room seat the spectator chose to keep near.
import assert from "node:assert/strict";

import { seatOfView, viewForGame } from "../src/variant/observerSeat.ts";

// First game: no remembered seat, the first player is near as before.
assert.equal(viewForGame(null, false, true), 0);
assert.equal(viewForGame(null, true, true), 0);
// Game 1, host first: view 0 shows seat 0 (the host).
let seat = seatOfView(viewForGame(null, false, true), false);
assert.equal(seat, 0);
// Game 2, the other player goes first (swapped): keep the host near = view 1.
assert.equal(viewForGame(seat, true, true), 1);
assert.equal(seatOfView(1, true), 0, "still the host's seat");
// With the option off every game shows the first player near, as before.
assert.equal(viewForGame(seat, true, false), 0);
// A manual switch in game 2 (view 0 while swapped) remembers the other seat,
// which game 3 keeps whatever the order.
seat = seatOfView(0, true);
assert.equal(seat, 1);
assert.equal(viewForGame(seat, false, true), 1);
assert.equal(viewForGame(seat, true, true), 0);
console.log(
  "Observer seat: first game, kept seat across a swap, opt-out and manual switch passed.",
);
