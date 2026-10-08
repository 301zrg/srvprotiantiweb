import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = join(root, ".audit-tmp");
mkdirSync(temporaryRoot, { recursive: true });
const fixture = mkdtempSync(join(temporaryRoot, "environment-snapshot-"));
const lockPath = "resources-staging/1103/environment-v1.json";
const archivePath = "resources-staging/1103/environment-v1.data";
const originalLock = readFileSync(join(root, lockPath));
const lock = JSON.parse(originalLock);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = () =>
  spawnSync(process.execPath, ["scripts/restore_environment_assets.mjs"], {
    cwd: fixture,
    encoding: "utf8",
    timeout: 20000,
  });
const assertUnchanged = () => {
  for (const file of lock.files) {
    assert.equal(
      sha(readFileSync(join(fixture, "public/environment", file.path))),
      file.sha256,
    );
  }
};
const fail = (message) => {
  const result = run();
  assert.notEqual(result.status, 0, "Invalid resource inputs must fail");
  assert.match(result.stderr, message);
  assertUnchanged();
};
try {
  for (const path of [
    ...Object.keys(lock.inputs),
    lockPath,
    archivePath,
    "scripts/restore_environment_assets.mjs",
  ]) {
    mkdirSync(dirname(join(fixture, path)), { recursive: true });
    copyFileSync(join(root, path), join(fixture, path));
  }
  assert.equal(
    run().status,
    0,
    "Fresh checkout must restore without Python or npm dependencies",
  );
  assertUnchanged();

  const generatorPath = "scripts/build_environment_assets.py";
  const generator = readFileSync(join(fixture, generatorPath));
  writeFileSync(
    join(fixture, generatorPath),
    generator.toString().replace(/\r?\n/g, "\r\n"),
  );
  assert.equal(
    run().status,
    0,
    "Windows line endings must not change source fingerprints",
  );
  assertUnchanged();
  writeFileSync(
    join(fixture, generatorPath),
    Buffer.concat([generator, Buffer.from("\n# changed generation rule\n")]),
  );
  fail(/changed: rebuild/);
  writeFileSync(join(fixture, generatorPath), generator);

  const cardPath = "resources-staging/1103/zh-CN/cards.cdb";
  const cards = readFileSync(join(fixture, cardPath));
  const changedCards = Buffer.from(cards);
  changedCards[0] ^= 1;
  writeFileSync(join(fixture, cardPath), changedCards);
  fail(/changed: rebuild/);
  writeFileSync(join(fixture, cardPath), cards);

  const archive = readFileSync(join(fixture, archivePath));
  const changedArchive = Buffer.from(archive);
  changedArchive[changedArchive.length - 1] ^= 1;
  writeFileSync(join(fixture, archivePath), changedArchive);
  fail(/Snapshot checksum mismatch/);
  writeFileSync(join(fixture, archivePath), archive);

  const oversized = structuredClone(lock);
  oversized.archive.decodedBytes = 32 * 1024 * 1024;
  writeFileSync(join(fixture, lockPath), JSON.stringify(oversized));
  fail(/AssertionError/);

  const escaped = structuredClone(lock);
  escaped.files[0].path = "../escape.json";
  writeFileSync(join(fixture, lockPath), JSON.stringify(escaped));
  fail(/Unexpected snapshot paths/);
  writeFileSync(join(fixture, lockPath), originalLock);
  assert.equal(run().status, 0);
  assertUnchanged();
  console.log(
    "Environment snapshot passed: exact bytes, no Python, portable text fingerprints, source/rule/archive tamper rejection, bounded unpacking and safe paths",
  );
} finally {
  const actual = realpathSync(fixture);
  const allowed = realpathSync(temporaryRoot);
  assert.equal(
    dirname(actual).toLowerCase(),
    allowed.toLowerCase(),
    "Cleanup must stay in the workspace fixture directory",
  );
  rmSync(actual, { recursive: true, force: true });
}
