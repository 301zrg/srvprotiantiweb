import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

async function compile(target = "") {
  const result = await build({
    entryPoints: ["src/variant/joinForm.ts"], bundle: true, write: false,
    format: "cjs", platform: "browser", tsconfig: "tsconfig.json",
    define: { "import.meta.env.VITE_DEPLOY_TARGET": JSON.stringify(target) },
  });
  return result.outputFiles[0].text;
}
const compiled = await compile();
const store = () => {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};
const load = (localStorage, sessionStorage, code = compiled, path = "/") => {
  const exports = {};
  const context = {
    exports, module: { exports }, localStorage, sessionStorage,
    window: { location: { pathname: path } },
  };
  vm.runInNewContext(code, context);
  return context.module.exports;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const local = store(), session = store();
const input = { nickname: "玩家$dummy", roomName: " M#房间$test " };
let form = load(local, session);
assert.deepEqual(plain(form.readJoinForm()), { nickname: "", roomName: "TT" });
form.saveJoinForm(input);
form = load(local, session); // Fresh module/document, same tab storage.
assert.deepEqual(plain(form.readJoinForm()), input, "A refresh retains both passwords and exact input");
assert.equal(local.getItem("playerNickname"), "玩家");
assert.equal(local.getItem("playerRoomName"), " M#房间");
assert.deepEqual(plain(load(local, store()).readJoinForm()), input,
  "Closing the tab/browser retains complete ordinary inputs");
form.saveJoinForm({ roomName: "New$other" });
form = load(local, session);
assert.deepEqual(plain(form.readJoinForm()), { nickname: input.nickname, roomName: "New$other" });
form.saveJoinForm({ nickname: "", roomName: "" });
assert.deepEqual(plain(load(local, session).readJoinForm()), { nickname: "", roomName: "" });
form.saveJoinForm(input);
form.clearJoinForm();
assert.deepEqual(plain(load(local, session).readJoinForm()), { nickname: "", roomName: "" });
assert.deepEqual(plain(load(local, store()).readJoinForm()), { nickname: "", roomName: "" }, "Intentional clearing survives browser reopen");

const tabs = [store(), store()];
const names = ["TabA$testA", "TabB$testB"];
tabs.forEach((tab, index) => load(local, tab).saveJoinForm({ nickname: names[index], roomName: `Room${index}$test` }));
tabs.forEach((tab, index) => assert.equal(load(local, tab).readJoinForm().nickname, names[index], "Tabs retain their own passwords"));

const blocked = {
  getItem() { throw new Error("Storage blocked"); },
  setItem() { throw new Error("Storage blocked"); },
  removeItem() { throw new Error("Storage blocked"); },
};
form = load(local, blocked);
form.saveJoinForm(input);
assert.deepEqual(plain(form.readJoinForm()), input, "Storage failure still allows editing and connecting");
const privateOnly = store();
load(blocked, privateOnly).saveJoinForm(input);
assert.deepEqual(plain(load(blocked, privateOnly).readJoinForm()), input);
load(blocked, privateOnly).clearJoinForm();
assert.deepEqual(plain(load(blocked, privateOnly).readJoinForm()), { nickname: "", roomName: "" });

// A legacy tab without a session draft keeps the existing public defaults.
assert.equal(load(local, store()).readJoinForm().nickname, input.nickname);
const legacyLocal = store(), legacySession = store();
legacyLocal.setItem("playerNickname", "Legacy");
legacyLocal.setItem("playerRoomName", "TT");
assert.deepEqual(plain(load(legacyLocal, legacySession).readJoinForm()), {nickname:"Legacy",roomName:"TT"});
legacySession.setItem("joinFormDraft", JSON.stringify(input));
assert.deepEqual(plain(load(legacyLocal, legacySession).readJoinForm()), input);
assert.deepEqual(plain(load(legacyLocal, store()).readJoinForm()), input,
  "Existing complete tab draft migrates once to durable storage");
// Merely reading an older tab must not overwrite the latest browser draft.
const other = store();
load(legacyLocal, other).saveJoinForm({ nickname: "Newer$secret", roomName: "Other$room" });
load(legacyLocal, legacySession).readJoinForm();
assert.equal(load(legacyLocal, store()).readJoinForm().nickname, "Newer$secret");
const toyCode = await compile("bilitoy");
const toyLocal = store(), toySession = store();
load(toyLocal, toySession, toyCode, "/toy/square/example-v1/index.html").saveJoinForm(input);
assert.deepEqual(plain(load(toyLocal, toySession, toyCode, "/toy/square/example-v2/index.html").readJoinForm()), input);
assert.deepEqual(plain(load(toyLocal, toySession, toyCode, "/toy/square/other-v1/index.html").readJoinForm()), { nickname: "", roomName: "TT" });
const sessionKey = [...toySession.values.keys()][0];
for (const damaged of ["{", "null", "[]", '{"nickname":1,"roomName":"x"}', '{"nickname":"x"}']) {
  toySession.setItem(sessionKey, damaged);
  assert.deepEqual(plain(load(toyLocal, toySession, toyCode, "/toy/square/example-v2/index.html").readJoinForm()), input);
}
console.log("PASS join-form cache: browser reopen, exact inputs, migration, tab isolation, clearing, namespaces and blocked-storage fallback");
