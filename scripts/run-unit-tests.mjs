import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Run every listed logic test in its own Node process and report all failures at the end.
const { tests } = JSON.parse(readFileSync(new URL("./unit-tests.json", import.meta.url), "utf8"));
const failed = [];
for (const file of tests) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [file], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) console.log(`ok   ${file} (${seconds}s)`);
  else {
    failed.push(file);
    console.log(`FAIL ${file} (${seconds}s)\n${(result.stderr || result.stdout).trim().split("\n").slice(-15).join("\n")}`);
  }
}
console.log(`\n${tests.length - failed.length}/${tests.length} passed`);
if (failed.length) process.exit(1);
