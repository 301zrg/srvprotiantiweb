import assert from "node:assert/strict";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["src/service/duel/actionRequest.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "isolated-container-registry",
      setup(plugin) {
        plugin.onResolve({ filter: /^@\/container\/compat$/ }, () => ({
          path: "registry",
          namespace: "fake",
        }));
        plugin.onLoad({ filter: /.*/, namespace: "fake" }, () => ({
          contents:
            "export const isUIContainer = c => c === globalThis.__activeDuelContainer;",
          loader: "js",
        }));
      },
    },
  ],
});
const { beginActionRequest, invalidateActionRequest, claimActionRequest } =
  await import(
    `data:text/javascript;base64,${Buffer.from(
      built.outputFiles[0].text,
    ).toString("base64")}`
  );
const connection = () => {
  const ws = new EventTarget();
  ws.readyState = 1;
  return { ws, signal: new AbortController().signal };
};
const c = { conn: connection() };
globalThis.__activeDuelContainer = c;
assert.equal(
  claimActionRequest(c),
  undefined,
  "No active Core question means no phase/card response",
);
beginActionRequest(c);
const first = claimActionRequest(c);
assert.equal(first.source, "idle");
assert.equal(
  claimActionRequest(c),
  undefined,
  "A pending candidate/confirmation owns the request",
);
first.release();
const retry = claimActionRequest(c);
let sent = 0;
assert.equal(
  retry.submit(() => {
    sent++;
    assert.equal(claimActionRequest(c), undefined);
  }),
  true,
);
assert.equal(
  retry.submit(() => sent++),
  false,
);
retry.release();
assert.equal(sent, 1);
assert.equal(
  claimActionRequest(c),
  undefined,
  "Releasing after submission must not enable another send",
);
beginActionRequest(c, "battle");
const battle = claimActionRequest(c);
assert.equal(battle.source, "battle");
beginActionRequest(c);
assert.equal(battle.signal.aborted, true);
assert.equal(
  battle.submit(() => sent++),
  false,
);
battle.release();
const disconnect = claimActionRequest(c);
c.conn.ws.readyState = 3;
c.conn.ws.dispatchEvent(new Event("close"));
assert.equal(disconnect.signal.aborted, true);
disconnect.release();
beginActionRequest(c);
assert.equal(claimActionRequest(c), undefined);
c.conn = connection();
beginActionRequest(c);
const replaced = claimActionRequest(c);
c.conn = connection();
assert.equal(
  replaced.valid(),
  false,
  "Replacing a socket inside a Container must not retarget a frozen request",
);
assert.equal(
  replaced.submit(() => sent++),
  false,
);
replaced.release();
beginActionRequest(c);
const old = claimActionRequest(c);
globalThis.__activeDuelContainer = { conn: connection() };
assert.equal(old.valid(), false);
assert.equal(
  old.submit(() => sent++),
  false,
);
old.release();
globalThis.__activeDuelContainer = c;
invalidateActionRequest(c);
assert.equal(claimActionRequest(c), undefined);
for (const state of ["resuming", "endedRoom"]) {
  c.conn[state] = true;
  beginActionRequest(c);
  assert.equal(claimActionRequest(c), undefined, state);
  c.conn[state] = false;
}
assert.equal(sent, 1);
delete globalThis.__activeDuelContainer;
console.log(
  "Request ownership, cancel/retry, exactly-once submission, revision/source, disconnect and connection replacement passed.",
);
