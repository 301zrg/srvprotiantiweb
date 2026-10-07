// Restore the exact reviewed resource bytes without Python's optional sqlite3.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const revision = "1103-201103-v1";
const locales = ["zh-CN", "en-US", "ja-JP", "ko-KR"];
const staged = join(root, "resources-staging", "1103");
const output = join(root, "public", "environment");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const lock = JSON.parse(
  readFileSync(join(staged, "environment-v1.json"), "utf8"),
);
assert.equal(lock.version, 1);
assert.equal(lock.revision, revision);
const inputs = [
  "docs/1103-resource-audit.json",
  "scripts/build_environment_assets.py",
  "scripts/check_environment_assets.py",
  ...locales.flatMap((locale) =>
    ["cards.cdb", "strings.conf"].map(
      (name) => `resources-staging/1103/${locale}/${name}`,
    ),
  ),
  "resources-staging/1103/lflist.conf",
];
assert.deepEqual(
  Object.keys(lock.inputs).sort(),
  inputs.sort(),
  "Incomplete source fingerprints",
);
for (const path of inputs) {
  let bytes = readFileSync(join(root, path));
  if (path.startsWith("docs/") || path.startsWith("scripts/")) {
    bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
  }
  assert.equal(
    sha(bytes),
    lock.inputs[path],
    `${path} changed: rebuild, verify and repackage the environment snapshot before publishing`,
  );
}
assert.equal(lock.archive.file, "environment-v1.data");
const packed = readFileSync(join(staged, lock.archive.file));
assert.equal(packed.length, lock.archive.bytes, "Snapshot size mismatch");
assert.equal(sha(packed), lock.archive.sha256, "Snapshot checksum mismatch");
assert.ok(
  Number.isSafeInteger(lock.archive.decodedBytes) &&
    lock.archive.decodedBytes > 0 &&
    lock.archive.decodedBytes <= 16 * 1024 * 1024,
);
const unpacked = gunzipSync(packed, { maxOutputLength: 16 * 1024 * 1024 });
assert.equal(
  unpacked.length,
  lock.archive.decodedBytes,
  "Snapshot decoded size mismatch",
);
const paths = [
  "current.json",
  `${revision}/manifest.json`,
  `${revision}/lflist.conf`,
  ...locales.flatMap((locale) =>
    ["cards.cdb", "strings.conf"].map(
      (name) => `${revision}/${locale}/${name}`,
    ),
  ),
];
assert.deepEqual(
  lock.files.map((file) => file.path).sort(),
  paths.sort(),
  "Unexpected snapshot paths",
);
let offset = 0;
const files = new Map();
for (const file of lock.files) {
  assert.ok(
    Number.isSafeInteger(file.bytes) &&
      file.bytes >= 0 &&
      offset + file.bytes <= unpacked.length,
    "Invalid snapshot entry size",
  );
  const bytes = unpacked.subarray(offset, offset + file.bytes);
  offset += file.bytes;
  assert.equal(sha(bytes), file.sha256, `${file.path} checksum mismatch`);
  files.set(file.path, bytes);
}
assert.equal(offset, unpacked.length, "Unexpected trailing snapshot data");
const manifest = JSON.parse(files.get(`${revision}/manifest.json`));
assert.equal(manifest.revision, revision);
assert.equal(manifest.cardCount, 5267);
assert.equal(manifest.banlistProtocolHash, "0x73ec4051");
assert.deepEqual(Object.keys(manifest.locales).sort(), [...locales].sort());
assert.equal(JSON.parse(files.get("current.json")).revision, revision);
for (const locale of locales) {
  const cards = files.get(`${revision}/${locale}/cards.cdb`);
  assert.equal(cards.subarray(0, 16).toString(), "SQLite format 3\0");
  assert.equal(sha(cards), manifest.locales[locale].cardsSha256);
  assert.equal(
    sha(files.get(`${revision}/${locale}/strings.conf`)),
    manifest.locales[locale].stringsSha256,
  );
  assert.equal(
    manifest.source[locale],
    lock.inputs[`resources-staging/1103/${locale}/cards.cdb`],
  );
}
assert.equal(sha(files.get(`${revision}/lflist.conf`)), manifest.banlistSha256);
// Validate every input and output before publishing any restored file.
for (const [path, bytes] of files) {
  const destination = join(output, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}
console.log(
  `Verified and restored immutable ${revision}: four 5267-card databases, no Python required`,
);
