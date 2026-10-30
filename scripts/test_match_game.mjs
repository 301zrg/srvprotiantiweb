// Game number in a match: counted from MSG_START; a reconnecting player gets
// the current game's MSG_START again; a returning spectator gets the match
// from game 1 and recounts.
import assert from "node:assert/strict";

import {
  countGameStart,
  matchGame,
  prepareMatchGameResume,
  resetMatchGame,
} from "../src/variant/matchGame.ts";

resetMatchGame();
countGameStart();
assert.equal(matchGame.number, 1, "G1");
countGameStart();
assert.equal(matchGame.number, 2, "G2 after siding");
// A player reconnects during G2: the repeated MSG_START is not a new game.
prepareMatchGameResume("player", true);
countGameStart();
assert.equal(matchGame.number, 2);
countGameStart();
assert.equal(matchGame.number, 3, "G3 still counts after the reconnect");
// A player reconnecting while siding receives no MSG_START.
prepareMatchGameResume("player", false);
countGameStart();
assert.equal(matchGame.number, 4);
// A spectator returns mid-match: the server replays G1 and G2 again.
prepareMatchGameResume("observer", true);
countGameStart();
countGameStart();
assert.equal(matchGame.number, 2, "recounted from the replayed history");
resetMatchGame();
assert.equal(matchGame.number, 0, "leaving the room clears it");
console.log(
  "Match game: G1-G3, player reconnect in a duel and while siding, spectator recount and reset passed.",
);
