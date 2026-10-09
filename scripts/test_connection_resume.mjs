import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const out = resolve(".audit-tmp/connection-resume-tests/resume.mjs");
mkdirSync(resolve(".audit-tmp/connection-resume-tests"), { recursive: true });
const compiled = await build({
  entryPoints: ["src/variant/connectionResume.ts"],
  bundle: true, write: false, format: "esm", platform: "node", external: ["google-protobuf"], tsconfig: "tsconfig.json",
});
writeFileSync(out, compiled.outputFiles[0].text);
const { prepareConnectionResume, checkConnectionResume, finishConnectionResume } = await import(pathToFileURL(out));
const fixture = (kind = "player", field = true) => {
  const sent = [], results = [];
  const deck = Uint8Array.of(3, 0, 2, 99);
  const conn = { initialDeckPayload: deck, ws: { send: bytes => sent.push([...bytes]) } };
  prepareConnectionResume(conn, kind, ok => results.push(ok), field);
  const packet = (msg, data = {}) => checkConnectionResume(conn, { msg, [msg]: data });
  return { conn, deck, sent, results, packet };
};
const notices = [
  "You will be reconnected to your previous game. Please pick your previous deck.",
  "你有未完成的对局，即将重新连接，请选择你在本局决斗中使用的卡组并准备。",
  "이전 게임에 다시 연결됩니다. 이전 덱을 선택하십시오.",
  "これから先程のゲームに再接続します。　前回のデッキを選択して下さい。",
];
for (const text of notices) {
  const t = fixture();
  t.packet("stoc_chat", { player: 14, msg: `[Server]: ${text}\0` });
  // The snapshot is frozen even if the caller edits its source buffer.
  t.deck[3] = 42;
  t.packet("stoc_join_game");
  t.packet("stoc_join_game");
  assert.deepEqual(t.sent, [[3, 0, 2, 99]]);
  t.packet("stoc_duel_start");
  t.packet("stoc_time_limit", { player: 0 });
  assert.deepEqual(t.results, []);
  t.packet("stoc_game_msg", { gameMsg: "reload_field" });
  t.packet("stoc_time_limit", { player: 0 });
  t.packet("stoc_time_limit", { player: 0 });
  assert.deepEqual(t.results, []);
  t.packet("stoc_time_limit", { player: 1 });
  assert.deepEqual(t.results, [true]);
  finishConnectionResume(t.conn, false);
  assert.deepEqual(t.results, [true]);
}
for (const sender of [0, 1, 7]) {
  const t = fixture();
  t.packet("stoc_chat", { player: sender, msg: notices[0] });
  t.packet("stoc_join_game");
  assert.deepEqual(t.sent, [], "Player chat cannot authorize a recovery");
  finishConnectionResume(t.conn, false);
}
for (const kind of ["player", "observer", "waiting"]) {
  const t = fixture(kind);
  t.packet("stoc_join_game");
  assert.deepEqual(t.sent, [], "A normal/expired room never auto-uploads a deck");
  if (kind === "observer") {
    t.packet("stoc_type_change", { self_type: 1 });
    assert.deepEqual(t.results, []);
    t.packet("stoc_type_change", { self_type: 100 });
    assert.deepEqual(t.results, [true]);
  } else if (kind === "waiting") {
    t.packet("stoc_type_change", { self_type: 1 });
    assert.deepEqual(t.results, [true]);
  } else {
    t.packet("stoc_error_msg");
    assert.deepEqual(t.results, [false]);
  }
}
for (const phase of ["stoc_select_hand", "stoc_select_tp", "stoc_change_side", "stoc_duel_start"]) {
  const t = fixture("player", false);
  t.packet("stoc_chat", { player: 8, msg: notices[0] });
  t.packet("stoc_join_game");
  t.packet(phase);
  assert.deepEqual(t.results, [true]);
  assert.equal(t.sent.length, 1);
}
console.log("PASS 14 recovery cases: four languages, frozen G1, complete field confirmation, role checks, expired rooms and pre-duel/Side phases");
