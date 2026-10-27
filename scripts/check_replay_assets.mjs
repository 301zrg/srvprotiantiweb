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
