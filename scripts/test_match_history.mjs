// The action log covers the whole match: rows survive the end of a game and
// the next MSG_START, and only leaving the room clears them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { HistoryStore } = await server.ssrLoadModule(
    "/src/stores/historyStore.ts",
  );
  const { countGameStart, matchGame, resetMatchGame } =
    await server.ssrLoadModule("/src/variant/matchGame.ts");
  const history = new HistoryStore();
  const matStore = {
    observerSwapped: false,
    turnCount: 1,
    phase: { currentPhase: 0 },
    isMe: (player) => player === 0,
  };
  const context = { matStore };
  const startGame = (swapped) => {
    matStore.observerSwapped = swapped;
    countGameStart();
    history.beginGame(context);
  };

  resetMatchGame();
  startGame(false);
  history.putTurn(context, 0);
  history.putDraw(context, 0, 1);
  history.declaration = { serial: 1, result: { kind: "option" } };
  assert.equal(history.historys[0].game, 1, "Rows record their game");
  assert.equal(history.historys[0].opponent, false);

  // The result dialog closes before the Side page opens.
  history.closeGame();
  assert.equal(history.historys.length, 2, "G1 stays for siding");
  assert.equal(
    history.declaration,
    undefined,
    "A finished game's declaration must not pop up again",
  );

  startGame(true);
  history.putTurn(context, 0);
  assert.equal(history.historys.length, 3, "G2 adds to G1");
  assert.deepEqual(
    history.historys.map((row) => row.game),
    [1, 1, 2],
  );
  assert.deepEqual(
    history.games.map((game) => [game.game, game.swapped]),
    [
      [1, false],
      [2, true],
    ],
    "Who sits where is kept per game: seats swap between games",
  );

  // A reconnecting player is sent the current game's MSG_START again.
  matchGame.resuming = true;
  startGame(true);
  assert.equal(history.games.length, 2, "The same game, not a new one");
  assert.equal(history.historys.length, 3);

  history.reset();
  assert.equal(history.historys.length, 0, "Leaving the room clears it");
  assert.equal(history.games.length, 0);

  // These two used to clear the log on every game of a match.
  const stores = readFileSync("src/stores/index.ts", "utf8");
  const resetDuel = stores.slice(stores.indexOf("export const resetDuel"));
  assert.ok(resetDuel.includes("historyStore.closeGame()"));
  assert.ok(!resetDuel.includes("historyStore.reset()"));
  const start = readFileSync("src/service/duel/start.ts", "utf8");
  assert.ok(!start.includes("historyStore.reset()"));
  assert.ok(start.includes("historyStore.beginGame(context)"));
  console.log(
    "Match history: rows survive game end and next start, per-game seats, reconnect start and room exit passed.",
  );
} finally {
  await server.close();
}
