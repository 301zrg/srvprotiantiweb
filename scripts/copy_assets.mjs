import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

mkdirSync(process.argv[2] || "dist", { recursive: true });
const assetsRoot = resolve("neos-assets");
cpSync("neos-assets", join(process.argv[2] || "dist", "neos-assets"), {
  recursive: true,
  force: true,
  filter(source) {
    const parts = relative(assetsRoot, resolve(source)).split(sep);
    return (
      parts[0] !== "deck-cases" && !(parts[0] === "sound" && parts[1] === "BGM")
    );
  },
});

// An explicit recovery list lets Safari replace a truncated cached module
// before starting a new document and resetting failed route/initializer state.
const output = process.argv[2] || "dist";
const scripts = join(output, "assets");
const files = readdirSync(scripts)
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => {
    const bytes = readFileSync(join(scripts, name));
    return {
      path: `assets/${name}`,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
writeFileSync(
  join(output, "assets-manifest.json"),
  JSON.stringify({ version: 1, files }) + "\n",
);
