// Builds one rule environment for replay playback as a delta over 706-v1 (plan 02 §3.2–3.4).
//   node scripts/build_replay_revision.mjs --id 706-20260907 --tree <layered dir> --digest <sha256>
//     --effective-from null|<unix seconds> --evidence <text> --specials <commit> --tree706 <sha>
// <layered dir> holds the server's layers (expansions/script, script; specials if any) as a
// private, uncommitted snapshot. The v1 bundle is never modified.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { digest, effective, lf, pack, readLayers, sha256, unpack } from "./replay_tree.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const V1 = path.join(ROOT, "public/replay/706-v1");
const OUT = path.join(ROOT, "public/replay/revisions");
const SRC_INDEX = path.join(ROOT, "src/replay/revisions.json");
const LIMITS = { maxFiles: 20000, maxFileBytes: 1024 * 1024, maxUnpackedBytes: 16 * 1024 * 1024 };

const arg = (name) => {
  const i = process.argv.indexOf("--" + name);
  if (i < 0 || i + 1 >= process.argv.length) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
};
const id = arg("id"), treeDir = arg("tree"), expected = arg("digest");
const effectiveFromUnix = arg("effective-from") === "null" ? null : Number(arg("effective-from"));
if (!/^706-\d{8}(-\d+)?$/.test(id)) throw new Error("environment id must be 706-YYYYMMDD[-n]");
if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error("digest must be sha256");
if (effectiveFromUnix !== null && !Number.isSafeInteger(effectiveFromUnix)) throw new Error("effective-from must be integer seconds");

const v1ProfileBytes = fs.readFileSync(path.join(V1, "profile.json"));
const v1Profile = JSON.parse(v1ProfileBytes);
const v1 = unpack(zlib.gunzipSync(fs.readFileSync(path.join(V1, "scripts.data"))));
const target = effective(readLayers(treeDir));
const got = digest(target);
if (got !== expected) throw new Error(`target tree digest ${got} != expected ${expected}`);

// Compare full trees: content differing after LF normalisation goes into set,
// names present in v1 but absent in the target go into delete.
const set = [], del = [];
const names = new Set(target.map((f) => f.name));
for (const f of target) {
  const old = v1.get(f.name);
  if (f.bytes.length > LIMITS.maxFileBytes) throw new Error(`file too large: ${f.name}`);
  if (!old || sha256(lf(old)) !== sha256(lf(f.bytes))) set.push({ name: f.name, bytes: f.bytes });
}
for (const name of v1.keys()) if (!names.has(name)) del.push(name);
del.sort();

// The merged tree must reproduce the target digest exactly.
const merged = new Map(v1);
for (const name of del) merged.delete(name);
for (const f of set) merged.set(f.name, f.bytes);
const mergedTree = [...merged].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => (a.name < b.name ? -1 : 1));
if (digest(mergedTree) !== expected) throw new Error("v1 + delta does not reproduce the target digest");
if (mergedTree.length > LIMITS.maxFiles) throw new Error("too many files");

// The delta names its base by the v1 scripts.data SHA, which the browser verifies while
// loading v1 anyway (the profile file's own bytes cannot be reproduced from bundled JSON).
const v1ProfileSha256 = sha256(v1ProfileBytes);
const v1ScriptsSha256 = v1Profile.files["scripts.data"].sha256;
const unpacked = pack(set, { base: v1ScriptsSha256, delete: del });
const delta = zlib.gzipSync(unpacked, { level: 9 });
const profile = {
  format: 1,
  id,
  effectiveFromUnix,
  evidence: arg("evidence"),
  base: { revision: v1Profile.revision, scriptsDataSha256: v1ScriptsSha256, profileSha256: v1ProfileSha256 },
  specials: { commit: arg("specials"), tree706: arg("tree706") },
  core: v1Profile.core,
  cardsDataSha256: v1Profile.files["cards.data"].sha256,
  luaTreeSha256: expected,
  scriptCount: mergedTree.length,
  delta: { bytes: delta.length, sha256: sha256(delta), unpackedBytes: unpacked.length, set: set.length, delete: del.length },
  limits: LIMITS,
};
const dir = path.join(OUT, id);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "delta.data"), delta);
const profileText = JSON.stringify(profile, null, 2) + "\n";
fs.writeFileSync(path.join(dir, "profile.json"), profileText);

// Environment list: append or replace this id, then enforce the table rules (02 §2).
const indexFile = path.join(OUT, "index.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : { format: 1, base: v1Profile.revision, environments: [] };
index.environments = index.environments.filter((e) => e.id !== id);
index.environments.push({ id, effectiveFromUnix, profileSha256: sha256(Buffer.from(profileText)) });
index.environments.sort((a, b) => (a.effectiveFromUnix ?? -Infinity) - (b.effectiveFromUnix ?? -Infinity));
const envs = index.environments;
if (new Set(envs.map((e) => e.id)).size !== envs.length) throw new Error("duplicate environment id");
envs.forEach((e, i) => {
  if ((e.effectiveFromUnix === null) !== (i === 0)) throw new Error("only the first environment may have a null start");
  if (i > 1 && !(e.effectiveFromUnix > envs[i - 1].effectiveFromUnix)) throw new Error("boundaries must strictly increase");
});
const indexText = JSON.stringify(index, null, 2) + "\n";
fs.writeFileSync(indexFile, indexText);
fs.writeFileSync(SRC_INDEX, indexText);
console.log(JSON.stringify({ id, set: set.length, delete: del.length, deltaBytes: delta.length, scripts: mergedTree.length, digest: expected }));
