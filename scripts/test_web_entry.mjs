import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: ["src/variant/webEntrySession.ts"],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "browser",
  tsconfig: "tsconfig.json",
  define: { "import.meta.env.VITE_DEPLOY_TARGET": '""' },
  plugins: [
    {
      name: "entry-config",
      setup(b) {
        b.onResolve({ filter: /^\.\/index$/ }, (args) =>
          args.importer.endsWith("webEntrySession.ts")
            ? { path: "config", namespace: "fixture" }
            : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            'export const deckImportOrigins=["https://website.example"];',
        }));
      },
    },
  ],
});
function load(href, opener = {}) {
  const listeners = new Map(),
    timeouts = new Map(),
    intervals = new Map(),
    sends = [];
  let timer = 0;
  opener.postMessage = (data, origin) => sends.push({ data, origin });
  const window = {
    location: new URL(href),
    opener,
    history: {
      state: null,
      replaceState(_s, _t, url) {
        window.location = new URL(url);
      },
    },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  };
  const exports = {};
  const saved = new Map();
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  };
  const scope = {
    module: { exports },
    exports,
    URL,
    URLSearchParams,
    window,
    localStorage: storage,
    sessionStorage: storage,
    setTimeout: (fn) => {
      timeouts.set(++timer, fn);
      return timer;
    },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn) => {
      intervals.set(++timer, fn);
      return timer;
    },
    clearInterval: (id) => intervals.delete(id),
  };
  vm.runInNewContext(compiled.outputFiles[0].text, scope);
  return {
    api: scope.module.exports,
    window,
    sends,
    timeouts,
    intervals,
    saved,
    dispatch: (type, event) =>
      [...(listeners.get(type) ?? [])].forEach((fn) => fn(event)),
    message(data, overrides = {}) {
      this.dispatch("message", {
        origin: "https://website.example",
        source: opener,
        data,
        ...overrides,
      });
    },
  };
}
const request = "fixture_nonce_12345678";
const bridge = (intent = "spectate", extra = "room=Room42") =>
  `https://client.example/sub/index.html?lang=zh#/entry?v=1&intent=${intent}&${extra}&bridge=1&origin=https%3A%2F%2Fwebsite.example&request=${request}`;
const payload = (intent = "spectate", change = {}) => ({
  channel: "srvprotiantiweb:entry",
  version: 1,
  type: "payload",
  request,
  intent,
  credentials: { username: "Tester", password: "dummy" },
  ...change,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const [intent, route] of [
  ["regular", "/match"],
  ["ladder", "/match"],
  ["deck-editor", "/build"],
  ["replay-list", "/replays"],
]) {
  const env = load(
    `https://client.example/sub/index.html?intent=${intent}&lang=ja`,
  );
  const session = env.api.captureWebEntry();
  assert.equal(session.getSnapshot().entry.intent, intent);
  assert.equal(env.api.webEntryRoute(intent), route);
  assert.equal(env.window.location.pathname, "/sub/index.html");
  assert.equal(env.window.location.search, "?lang=ja");
  assert.equal(env.window.location.hash, "#/entry");
  assert.equal(
    env.api.captureWebEntry(),
    session,
    "capturing twice does not replay entry",
  );
}
const untouched = load("https://client.example/?intent=ladder#/replays");
assert.equal(
  untouched.api.captureWebEntry(),
  undefined,
  "outer intent cannot override explicit destinations",
);
{
  const env = load(
    "https://client.example/#/entry?v=1&intent=spectate&room=Public&autojoin=0",
  );
  const session = env.api.captureWebEntry();
  assert.equal(session.getSnapshot().entry.autojoin, false);
  assert.equal(session.claimAutojoin(), true);
  assert.equal(
    session.claimAutojoin(),
    false,
    "an entry can auto-connect at most once across remounts",
  );
}
for (const suffix of [
  "intent=unknown",
  "intent=spectate&room=TT",
  "intent=spectate&room=Room%24password",
  "intent=ladder&password=dummy",
  "intent=ladder&nickname=Name%24dummy",
  "intent=ladder&intent=regular",
  "intent=ladder&v=9",
]) {
  const env = load(`https://client.example/?${suffix}`);
  assert.equal(
    env.api.captureWebEntry().getSnapshot().error,
    "invalid-link",
    suffix,
  );
  assert.equal(
    env.window.location.search,
    "",
    "invalid entry fields scrubbed before loader",
  );
}
{
  const env = load(bridge()),
    session = env.api.captureWebEntry();
  assert.equal(session.getSnapshot().entry, undefined);
  assert.equal(env.sends[0].data.type, "ready");
  assert.equal(env.sends[0].origin, "https://website.example");
  env.message(payload(), { origin: "https://evil.example" });
  env.message(payload(), { source: {} });
  env.message(payload("regular"));
  env.message(payload("spectate", { request: "wrong_nonce_123456" }));
  assert.equal(
    session.getSnapshot().entry,
    undefined,
    "unmatched source/window/intent/request ignored",
  );
  env.message(payload());
  assert.equal(session.getSnapshot().entry.nickname, "Tester$dummy");
  assert.deepEqual(
    JSON.parse(env.saved.get("joinFormDraft")),
    { nickname: "Tester$dummy", roomName: "" },
    "authenticated spectating retains account but never caches target room",
  );
  env.message(
    payload("spectate", {
      credentials: { username: "Other", password: "other" },
    }),
  );
  assert.equal(
    session.getSnapshot().entry.nickname,
    "Tester$dummy",
    "first payload wins",
  );
  assert.equal(env.timeouts.size + env.intervals.size, 0);
  assert.equal(env.window.opener, null);
  assert.deepEqual(plain(env.sends.at(-1).data), {
    channel: "srvprotiantiweb:entry",
    version: 1,
    type: "result",
    request,
    intent: "spectate",
    status: "accepted",
  });
  assert.ok(
    !JSON.stringify(env.sends).includes("dummy"),
    "acknowledgement never echoes credentials",
  );
}
for (const credentials of [
  { username: "", password: "x" },
  { username: "LongerThanNineteen", password: "123" },
  { username: "Name$bad", password: "x" },
  { username: "Name", password: "" },
  { username: "Name", password: "a\\b" },
]) {
  const env = load(bridge());
  const session = env.api.captureWebEntry();
  env.message(payload("spectate", { credentials }));
  assert.equal(session.getSnapshot().error, "invalid-link");
}
for (const exit of ["timeout", "hashchange", "pagehide"]) {
  const env = load(bridge()),
    session = env.api.captureWebEntry();
  if (exit === "timeout") [...env.timeouts.values()][0]();
  else {
    if (exit === "hashchange") env.window.location.hash = "/match";
    env.dispatch(exit, {});
  }
  env.message(payload());
  assert.equal(
    session.getSnapshot().entry,
    undefined,
    `${exit} ignores late payload`,
  );
  assert.equal(env.timeouts.size + env.intervals.size, 0);
}
{
  const env = load(bridge().replace("website.example", "evil.example"));
  assert.equal(
    env.api.captureWebEntry().getSnapshot().error,
    "bridge-unavailable",
  );
  assert.equal(env.sends.length, 0, "untrusted origins never get ready");
}
console.log(
  "PASS web entry: destinations, URL cleanup, bridge isolation, account validation, replay and cancellation",
);
