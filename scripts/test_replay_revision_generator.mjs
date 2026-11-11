// Exercise the real CLI in disposable repositories, never the published assets.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import zlib from "node:zlib";
import { digest, pack, sha256 } from "./replay_tree.mjs";

const root = path.resolve(import.meta.dirname, "..");
const initialId = "706-20260907";
const nextId = "706-20261112";
const names = ["public/replay/revisions/index.json", "src/replay/revisions.json"];

function fixture(run) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, "replay-revision-test-"));
  try {
    for (const folder of ["scripts", "public/replay/706-v1", "public/replay/revisions", "src/replay", "tree/script"])
      fs.mkdirSync(path.join(dir, folder), { recursive: true });
    for (const name of ["build_replay_revision.mjs", "replay_tree.mjs"])
      fs.copyFileSync(path.join(root, "scripts", name), path.join(dir, "scripts", name));
    const script = Buffer.from("-- original\n");
    const data = zlib.gzipSync(pack([{ name: "c1.lua", bytes: script }]));
    fs.writeFileSync(path.join(dir, "public/replay/706-v1/scripts.data"), data);
    fs.writeFileSync(path.join(dir, "public/replay/706-v1/profile.json"), JSON.stringify({
      revision: "706-v1", core: "fixture-core",
      files: { "scripts.data": { sha256: sha256(data) }, "cards.data": { sha256: "a".repeat(64) } },
    }));
    const treeFile = path.join(dir, "tree/script/c1.lua");
    fs.writeFileSync(treeFile, script);
    const generate = (overrides = {}) => {
      const options = { id: nextId, "effective-from": "2000", evidence: "fixture", specials: "b".repeat(40), tree706: "c".repeat(40), ...overrides };
      const target = fs.readFileSync(treeFile);
      const result = spawnSync(process.execPath, [path.join(dir, "scripts/build_replay_revision.mjs"),
        "--tree", path.join(dir, "tree"), "--digest", digest([{ name: "c1.lua", bytes: target }]),
        ...Object.entries(options).flatMap(([key, value]) => [`--${key}`, value]),
      ], { encoding: "utf8" });
      assert.ifError(result.error);
      return result;
    };
    const first = generate({ id: initialId, "effective-from": "null" });
    assert.equal(first.status, 0, first.stderr);
    const snapshot = () => {
      const files = new Map();
      for (const relative of ["public/replay/revisions", "src/replay"]) {
        const walk = (folder) => {
          for (const entry of fs.readdirSync(path.join(dir, folder), { withFileTypes: true })) {
            const name = path.join(folder, entry.name);
            if (entry.isDirectory()) walk(name);
            else files.set(name, fs.readFileSync(path.join(dir, name)).toString("hex"));
          }
        };
        walk(relative);
      }
      return files;
    };
    run({ dir, treeFile, generate, snapshot });
  } finally {
    assert.equal(path.dirname(dir), tempRoot);
    assert.ok(path.basename(dir).startsWith("replay-revision-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("new environment preserves old bytes and keeps the two indexes identical", () => fixture(({ dir, generate, snapshot }) => {
  const before = snapshot();
  const result = generate();
  assert.equal(result.status, 0, result.stderr);
  const after = snapshot();
  for (const [name, bytes] of before)
    if (!names.includes(name.replaceAll("\\", "/"))) assert.equal(after.get(name), bytes);
  assert.deepEqual(...names.map(name => fs.readFileSync(path.join(dir, name))));
}));

test("identical existing ID is a no-op, including file modification times", () => fixture(({ dir, generate, snapshot }) => {
  assert.equal(generate().status, 0);
  const before = snapshot();
  const stamp = new Date("2001-01-01T00:00:00Z");
  for (const name of before.keys()) fs.utimesSync(path.join(dir, name), stamp, stamp);
  const result = generate();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(), before);
  for (const name of before.keys()) assert.equal(fs.statSync(path.join(dir, name)).mtimeMs, stamp.getTime(), name);
}));

for (const [reason, options, changeTree] of [
  ["Lua contents", {}, true],
  ["boundary", { "effective-from": "2001" }],
  ["evidence", { evidence: "different" }],
  ["specials provenance", { specials: "d".repeat(40) }],
  ["706 subtree provenance", { tree706: "e".repeat(40) }],
]) test(`existing ID rejects changed ${reason} without writing`, () => fixture(({ treeFile, generate, snapshot }) => {
  assert.equal(generate().status, 0);
  const before = snapshot();
  if (changeTree) fs.writeFileSync(treeFile, "-- different\n");
  const result = generate(options);
  assert.notEqual(result.status, 0, "an existing environment must be immutable");
  assert.match(result.stderr, /existing|immutable|differs/i);
  assert.deepEqual(snapshot(), before);
}));

test("invalid new boundary leaves no half-generated directory", () => fixture(({ generate, snapshot }) => {
  const before = snapshot();
  const result = generate({ "effective-from": "null" });
  assert.notEqual(result.status, 0);
  assert.deepEqual(snapshot(), before);
}));

for (const name of ["profile.json", "delta.data"])
  test(`existing ID rejects a changed ${name} without repairing it`, () => fixture(({ dir, generate, snapshot }) => {
    assert.equal(generate().status, 0);
    fs.appendFileSync(path.join(dir, "public/replay/revisions", nextId, name), " ");
    const before = snapshot();
    const result = generate();
    assert.notEqual(result.status, 0);
    assert.deepEqual(snapshot(), before);
  }));

test("unindexed existing directory is preserved and rejected", () => fixture(({ dir, generate, snapshot }) => {
  const folder = path.join(dir, "public/replay/revisions", nextId);
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, "profile.json"), "manual artifact");
  const before = snapshot();
  assert.notEqual(generate().status, 0);
  assert.deepEqual(snapshot(), before);
}));

test("mismatched source and public indexes are rejected before writes", () => fixture(({ dir, generate, snapshot }) => {
  fs.appendFileSync(path.join(dir, names[1]), " ");
  const before = snapshot();
  assert.notEqual(generate().status, 0);
  assert.deepEqual(snapshot(), before);
}));

test("duplicate existing IDs cannot be silently replaced", () => fixture(({ dir, generate, snapshot }) => {
  const index = JSON.parse(fs.readFileSync(path.join(dir, names[0])));
  index.environments.push({ ...index.environments[0] });
  for (const name of names) fs.writeFileSync(path.join(dir, name), JSON.stringify(index));
  const before = snapshot();
  assert.notEqual(generate({ id: initialId, "effective-from": "null" }).status, 0);
  assert.deepEqual(snapshot(), before);
}));

test("two non-null boundaries cannot be equal", () => fixture(({ generate, snapshot }) => {
  assert.equal(generate().status, 0);
  const before = snapshot();
  assert.notEqual(generate({ id: "706-20261113", "effective-from": "2000" }).status, 0);
  assert.deepEqual(snapshot(), before);
}));

for (const name of ["profile.json", "delta.data"])
  test(`existing ID rejects a missing ${name}`, () => fixture(({ dir, generate, snapshot }) => {
    assert.equal(generate().status, 0);
    fs.unlinkSync(path.join(dir, "public/replay/revisions", nextId, name));
    const before = snapshot();
    assert.notEqual(generate().status, 0);
    assert.deepEqual(snapshot(), before);
  }));

test("existing ID rejects unexpected directory contents", () => fixture(({ dir, generate, snapshot }) => {
  assert.equal(generate().status, 0);
  fs.writeFileSync(path.join(dir, "public/replay/revisions", nextId, "partial.tmp"), "incomplete");
  const before = snapshot();
  assert.notEqual(generate().status, 0);
  assert.deepEqual(snapshot(), before);
}));

for (const name of names)
  test(`missing index ${name} is not silently repaired`, () => fixture(({ dir, generate, snapshot }) => {
    fs.unlinkSync(path.join(dir, name));
    const before = snapshot();
    assert.notEqual(generate().status, 0);
    assert.deepEqual(snapshot(), before);
  }));
