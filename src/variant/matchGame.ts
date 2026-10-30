import { proxy } from "valtio";

/** Which game of the match is shown, counted from MSG_START. A halfway or
 * returning spectator is sent the match from game 1, so recounting holds; a
 * reconnecting player is sent the current game's MSG_START again. */
export const matchGame = proxy({ number: 0, resuming: false });

export function resetMatchGame() {
  matchGame.number = 0;
  matchGame.resuming = false;
}

export function countGameStart() {
  if (matchGame.resuming) matchGame.resuming = false;
  else matchGame.number++;
}

/** Before reconnecting: spectators recount from game 1; a player in a duel
 * keeps the count and skips the repeated MSG_START. */
export function prepareMatchGameResume(
  kind: "player" | "observer" | "waiting",
  fieldExpected: boolean,
) {
  if (kind === "observer") resetMatchGame();
  else if (kind === "player") matchGame.resuming = fieldExpected;
}
