// Rule environments for replay playback (plan 02 §3.7): selection boundaries,
// table rules, every delta rejection in 02 §3.2, the real deltas reproducing the
// server digests, the verified load chain, and a full playback on a merged tree.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { createServer } from "vite";
import { digest, pack, sha256, unpack } from "./replay_tree.mjs";

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const rev = await server.ssrLoadModule("/src/replay/revisions.ts");
  const { ReplayEngine } = await server.ssrLoadModule("/src/replay/engine.ts");
  const index = JSON.parse(readFileSync("public/replay/revisions/index.json", "utf8"));
  const v1Profile = JSON.parse(readFileSync("public/replay/706-v1/profile.json", "utf8"));
  const v1Raw = gunzipSync(readFileSync("public/replay/706-v1/scripts.data"));
  const v1 = new Uint8Array(v1Raw);

  // --- selection (02 §3.5) ---
  const list = [
    { id: "706-20260907", effectiveFromUnix: null, profileSha256: "a".repeat(64) },
    { id: "706-20261110", effectiveFromUnix: 1000, profileSha256: "b".repeat(64) },
    { id: "706-20261201", effectiveFromUnix: 2000, profileSha256: "c".repeat(64) },
  ];
  const now = 5000;
  const pick = (t, l = list) => rev.selectEnvironment(t, now, l);
  assert.deepEqual(pick(1000), { id: "706-20261110", basis: "auto" }, "exactly at the boundary");
  assert.equal(pick(999).id, "706-20260907", "one second before");
  assert.equal(pick(1001).id, "706-20261110", "one second after");
  assert.equal(pick(1).id, "706-20260907", "earlier than every boundary");
  assert.equal(pick(1999).id, "706-20261110");
  assert.equal(pick(2000).id, "706-20261201");
  assert.deepEqual(pick(0), { id: "706-20261201", basis: "fallback", reason: "no-timestamp" });
  assert.deepEqual(pick(now + 86401), { id: "706-20261201", basis: "fallback", reason: "future" });
  assert.equal(pick(now + 86400).basis, "auto", "within the one-day tolerance");
  assert.deepEqual(pick(42, list.slice(0, 1)), { id: "706-20260907", basis: "auto" }, "single environment");

  // --- table rules (02 §2) ---
  const bad = (l) => assert.throws(() => rev.validateEnvironments(l), /规则环境表异常/);
  bad([]);
  bad([list[0], { ...list[1], id: list[0].id }]);
  bad([list[0], { ...list[1], effectiveFromUnix: null }]);
  bad([{ ...list[0], effectiveFromUnix: 5 }, list[1]]);
  bad([list[0], list[2], list[1]]);
  bad([list[0], list[1], { ...list[2], effectiveFromUnix: 1000 }]);
  bad([list[0], { ...list[1], id: "706-2026-11-10" }]);
  assert.equal(rev.validateEnvironments(index.environments).length, index.environments.length);

  // --- the real deltas reproduce the server digests ---
  const merged = {};
  for (const e of index.environments) {
    const profile = JSON.parse(readFileSync(`public/replay/revisions/${e.id}/profile.json`));
    assert.equal(sha256(readFileSync(`public/replay/revisions/${e.id}/profile.json`)), e.profileSha256);
    const delta = gunzipSync(readFileSync(`public/replay/revisions/${e.id}/delta.data`));
    assert.equal(delta.length, profile.delta.unpackedBytes);
    const out = await rev.applyDelta(v1, new Uint8Array(delta), profile.limits);
    const files = unpack(Buffer.from(out));
    const tree = [...files].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => (a.name < b.name ? -1 : 1));
    assert.equal(digest(tree), profile.luaTreeSha256, `${e.id} merged tree equals the server digest`);
    assert.equal(files.size, profile.scriptCount);
    merged[e.id] = out;
  }

  // --- every rejection in 02 §3.2 ---
  const limits = { maxFiles: 20000, maxFileBytes: 1024 * 1024, maxUnpackedBytes: 16 * 1024 * 1024 };
  const base = v1Profile.files["scripts.data"].sha256;
  const make = (set, del = [], b = base, rawIndex) => {
    if (rawIndex) {
      const json = Buffer.from(JSON.stringify(rawIndex)), head = Buffer.alloc(4);
      head.writeUInt32LE(json.length);
      return new Uint8Array(Buffer.concat([head, json, ...set.map((f) => f.bytes)]));
    }
    return new Uint8Array(pack(set.map((f) => ({ name: f.name, bytes: Buffer.from(f.bytes) })), { base: b, delete: del }));
  };
  const f = (name, s = "x") => ({ name, bytes: Buffer.from(s) });
  const rejects = async (delta, re, l = limits) => assert.rejects(rev.applyDelta(v1, delta, l), re);
  await rejects(make([f("../c1.lua")]), /路径不规范/);
  await rejects(make([f("a\\c1.lua")]), /路径不规范/);
  await rejects(make([f("/c1.lua")]), /路径不规范/);
  await rejects(make([f("sub/c1.lua")]), /路径不规范/);
  await rejects(make([f("c1.lua"), f("c1.lua")]), /重复或大小写冲突/);
  await rejects(make([f("c1.lua"), f("C1.lua")]), /重复或大小写冲突/);
  await rejects(make([f("UTILITY.lua")]), /重复或大小写冲突/, limits); // case clash with an existing base name
  await rejects(make([f("c1.lua")], ["c1.lua"]), /重复或大小写冲突/, limits); // both set and delete
  await rejects(make([], ["c999999999.lua"]), /要删除的文件不存在/);
  await rejects(make([f("c1.lua")], [], "0".repeat(64)), /底稿不符/);
  const one = Buffer.from("abc");
  await rejects(make([{ name: "c1.lua", bytes: one }], [], base, { base, delete: [], set: [{ name: "c1.lua", offset: 1, bytes: 3, sha256: sha256(one) }] }), /偏移越界/);
  await rejects(make([{ name: "c1.lua", bytes: one }], [], base, { base, delete: [], set: [{ name: "c1.lua", offset: 0, bytes: 9, sha256: sha256(one) }] }), /偏移越界/);
  await rejects(make([{ name: "c1.lua", bytes: one }], [], base, { base, delete: [], set: [{ name: "c1.lua", offset: 0, bytes: 3, sha256: "0".repeat(64) }] }), /文件校验失败/);
  await rejects(make([{ name: "c1.lua", bytes: one }], [], base, { base, delete: [], set: [{ name: "c1.lua", offset: 0, bytes: 2, sha256: sha256(one) }] }), /剩余数据异常/);
  await rejects(make([f("c1.lua", "xxxx")]), /偏移越界/, { ...limits, maxFileBytes: 3 });
  await rejects(make([f("c1.lua")]), /文件数超限/, { ...limits, maxFiles: 10 });

  // --- the verified load chain: bundled index -> profile -> delta ---
  const realFetch = globalThis.fetch;
  const id = index.environments.at(-1).id;
  const served = (overrides = {}) => async (url) => {
    const p = new URL(url).pathname.replace(/^\/revisions\//, "");
    const body = overrides[p] ?? readFileSync(`public/replay/revisions/${p}`);
    return new Response(body, { status: 200 });
  };
  const load = () => rev.loadEnvironmentScripts("http://local/revisions/", id, v1, () => {});
  try {
    globalThis.fetch = served();
    assert.deepEqual(Buffer.from(await load()), Buffer.from(merged[id]), "chain loads the same tree");
    globalThis.fetch = served({ [`${id}/profile.json`]: readFileSync(`public/replay/revisions/${id}/profile.json`, "utf8").replace('"format": 1', '"format": 1 ') });
    await assert.rejects(load(), /规则环境校验失败/, "tampered profile");
    const d = readFileSync(`public/replay/revisions/${id}/delta.data`);
    const tampered = Buffer.from(d); tampered[tampered.length - 9] ^= 1;
    globalThis.fetch = served({ [`${id}/delta.data`]: tampered });
    await assert.rejects(load(), /播放资源校验失败/, "tampered delta package");
    await assert.rejects(rev.loadEnvironmentScripts("http://local/revisions/", "706-19990101", v1, () => {}), /不存在/);
  } finally {
    globalThis.fetch = realFetch;
  }

  // --- a full playback on a merged tree ---
  const create = (await import(pathToFileURL(resolve("public/replay/706-v1/ocgcore.js")))).default;
  const core = await create({ wasmBinary: readFileSync("public/replay/706-v1/ocgcore.wasm"), printErr: () => {} });
  const engine = new ReplayEngine(core);
  engine.install(readFileSync("public/replay/706-v1/cards.data"), merged[id]);
  let frame = engine.open(new Uint8Array(readFileSync("tests/fixtures/replay/native-deckout.yrp")));
  for (let i = 0; i < 20000 && !frame.end; i++) frame = engine.next();
  assert.equal(frame.end, "complete", "replay plays to the end on the newest environment");
  engine.close();
  console.log("Replay revisions: selection, table rules, real deltas = server digests, 16 rejections, verified chain, full playback");
} finally {
  await server.close();
}
