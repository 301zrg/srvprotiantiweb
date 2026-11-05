// A saved "in duel" hint is provisional; the server may already be siding.
import assert from "node:assert/strict";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
const previousStorage = globalThis.sessionStorage;
const data = new Map();
globalThis.sessionStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: key => data.delete(key),
};
try {
  const { historyStore } = await server.ssrLoadModule("/src/stores/historyStore.ts");
  const { matchGame, resetMatchGame, countGameStart } = await server.ssrLoadModule("/src/variant/matchGame.ts");
  const { setHistoryOwner, saveHistory, restoreSavedHistory } = await server.ssrLoadModule("/src/variant/historyResume.ts");
  const { checkConnectionResume, prepareConnectionResume, finishConnectionResume } = await server.ssrLoadModule("/src/variant/connectionResume.ts");
  const context = { matStore: {
    observerSwapped: false, isMe: player => player === 0,
    turnCount: 1, phase: { currentPhase: 0 },
  } };
  const owner = { player: "Fixture$test", passWd: "TT" };
  const saved = () => JSON.parse(data.get("duel-history-resume"));
  resetMatchGame(); countGameStart();
  const automatic = { ws: { send() {} } };
  prepareConnectionResume(automatic, "player", () => {}, true);
  checkConnectionResume(automatic, { msg: "stoc_change_side", stoc_change_side: {} });
  countGameStart();
  assert.equal(matchGame.number, 2, "Automatic recovery also trusts the server's actual siding phase");
  finishConnectionResume(automatic, false);
  for (const message of ["stoc_change_side", "stoc_select_hand", "stoc_select_tp", "stoc_waiting_side"]) {
    data.clear(); resetMatchGame(); historyStore.reset();
    setHistoryOwner(owner);
    countGameStart(); historyStore.beginGame(context); historyStore.putTurn(context, 0);
    // The WIN dialog can still be open when this page is killed.
    saveHistory();
    assert.equal(saved().inDuel, true);
    resetMatchGame(); historyStore.reset();
    assert.equal(restoreSavedHistory(), true);
    checkConnectionResume({}, { msg: message, [message]: {} });
    countGameStart(); historyStore.beginGame(context);
    assert.equal(matchGame.number, 2, `${message}: G2 must not be mistaken for a repeated G1 start`);
    assert.deepEqual(historyStore.games.map(game => game.game), [1, 2], "G1 mapping survives");
  }
  // Until the server establishes a phase, a second reload preserves the saved
  // snapshot instead of inferring a new phase from reset stores.
  for (const inDuel of [true, false]) {
    data.clear(); resetMatchGame(); historyStore.reset();
    setHistoryOwner(owner);
    countGameStart(); historyStore.beginGame(context); historyStore.putTurn(context, 0);
    if (!inDuel) checkConnectionResume({}, { msg: "stoc_change_side", stoc_change_side: {} });
    saveHistory();
    const original = data.get("duel-history-resume");
    resetMatchGame(); historyStore.reset();
    assert.equal(restoreSavedHistory(), true);
    saveHistory();
    assert.equal(data.get("duel-history-resume"), original, "Awaiting the server leaves the saved phase untouched");
    resetMatchGame(); historyStore.reset();
    assert.equal(restoreSavedHistory(), true);
    if (!inDuel) checkConnectionResume({}, { msg: "stoc_change_side", stoc_change_side: {} });
    countGameStart();
    assert.equal(matchGame.number, inDuel ? 1 : 2);
  }
  console.log("History resume: result-dialog reload, intermission packets, repeated reloads and in-duel restart passed.");
} finally {
  if (previousStorage === undefined) delete globalThis.sessionStorage;
  else globalThis.sessionStorage = previousStorage;
  await server.close();
}
