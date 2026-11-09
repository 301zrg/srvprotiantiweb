import { readFileSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve("public/replay/706-v1");
const profile = JSON.parse(readFileSync(join(root, "profile.json"), "utf8"));
const embedded = JSON.parse(readFileSync("src/replay/profile.json", "utf8"));
if (JSON.stringify(profile) !== JSON.stringify(embedded))
  throw new Error("Replay profile differs from the embedded lock");
for (const [name, record] of Object.entries(profile.files)) {
  if (
    !/^[a-zA-Z0-9.-]+$/.test(name) ||
    name.includes("..") ||
    record.bytes > 25 * 1024 * 1024
  )
    throw new Error("Invalid replay artifact path/size");
  const bytes = readFileSync(join(root, name));
  if (
    bytes.length !== record.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== record.sha256
  )
    throw new Error(`Replay artifact changed: ${name}`);
}
for (const name of readdirSync(root))
  if (!profile.files[name] && !["engine.json", "profile.json"].includes(name))
    throw new Error(`Unlisted replay artifact: ${name}`);
console.log(
  `Verified fixed replay ${profile.revision}: ${profile.cardCount} cards, ${profile.scriptCount} scripts, no compiler/Python needed`,
);

// Rule environments (plan 02 §3.1, §3.7): bundled list == served list, table
// rules, profile pinned by SHA, delta size/SHA/base, nothing unlisted.
const revisions = resolve("public/replay/revisions");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const served = readFileSync(join(revisions, "index.json"));
if (!served.equals(readFileSync("src/replay/revisions.json")))
  throw new Error("revisions/index.json differs from src/replay/revisions.json");
const index = JSON.parse(served);
if (index.format !== 1 || index.base !== profile.revision || !Array.isArray(index.environments) || !index.environments.length)
  throw new Error("Invalid rule environment list");
const ids = new Set();
index.environments.forEach((e, i) => {
  if (!/^706-\d{8}(-\d+)?$/.test(e.id) || ids.has(e.id)) throw new Error(`Invalid or duplicate environment id ${e.id}`);
  ids.add(e.id);
  if ((e.effectiveFromUnix === null) !== (i === 0)) throw new Error("Only the first environment may have a null start");
  if (i > 1 && !(e.effectiveFromUnix > index.environments[i - 1].effectiveFromUnix))
    throw new Error("Environment boundaries must strictly increase");
  const dir = join(revisions, e.id);
  const profileBytes = readFileSync(join(dir, "profile.json"));
  if (sha(profileBytes) !== e.profileSha256) throw new Error(`Environment profile changed: ${e.id}`);
  const p = JSON.parse(profileBytes);
  if (p.id !== e.id || p.effectiveFromUnix !== e.effectiveFromUnix) throw new Error(`Environment profile mismatch: ${e.id}`);
  if (p.base.revision !== profile.revision || p.base.scriptsDataSha256 !== profile.files["scripts.data"].sha256 ||
      p.core !== profile.core || p.cardsDataSha256 !== profile.files["cards.data"].sha256)
    throw new Error(`Environment ${e.id} does not build on ${profile.revision}`);
  const delta = readFileSync(join(dir, "delta.data"));
  if (delta.length !== p.delta.bytes || sha(delta) !== p.delta.sha256) throw new Error(`Environment delta changed: ${e.id}`);
  for (const name of readdirSync(dir))
    if (!["profile.json", "delta.data"].includes(name)) throw new Error(`Unlisted environment file: ${e.id}/${name}`);
});
for (const name of readdirSync(revisions))
  if (name !== "index.json" && !ids.has(name)) throw new Error(`Unlisted environment: ${name}`);
console.log(`Verified ${index.environments.length} rule environments: ${[...ids].join(", ")}`);
