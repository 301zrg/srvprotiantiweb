import { cpSync, mkdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

mkdirSync("dist", { recursive: true });
const assetsRoot = resolve("neos-assets");
cpSync("neos-assets", join("dist", "neos-assets"), {
  recursive: true,
  force: true,
  filter(source) {
    const parts = relative(assetsRoot, resolve(source)).split(sep);
    return parts[0] !== "deck-cases" && !(parts[0] === "sound" && parts[1] === "BGM");
  },
});
