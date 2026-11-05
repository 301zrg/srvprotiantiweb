import { proxy } from "valtio";

/** Which game of the match is shown, counted from MSG_START. A halfway or
 * returning spectator is sent the match from game 1, so recounting holds; a
 * reconnecting player is sent the current game's MSG_START again. */
export const matchGame = proxy({
  number: 0,
  resuming: false,
  /** Unknown until a server phase arrives; reset stores are not phase evidence. */
  inDuel: undefined as boolean | undefined,
});

export function resetMatchGame() {
  matchGame.number = 0;
  matchGame.resuming = false;
  matchGame.inDuel = undefined;
}

export function countGameStart() {
  matchGame.inDuel = true;
  if (matchGame.resuming) matchGame.resuming = false;
  else matchGame.number++;
}

/** A stored resume hint must yield to the host's actual between-game phase. */
export function enterMatchIntermission() {
  matchGame.inDuel = false;
  matchGame.resuming = false;
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
