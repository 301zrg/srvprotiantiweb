import { execFileSync, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// CI has no .env.local. A missing endpoint must fail before replacing the live site.
let endpoint;
try {
  endpoint = new URL(process.env.VITE_DUEL_WS_URL?.trim() || "");
  if (
    endpoint.protocol !== "wss:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash
  ) {
    throw new Error("Invalid endpoint");
  }
} catch {
  console.error(
    "Set VITE_DUEL_WS_URL in Cloudflare build variables to a complete public wss:// URL without credentials or a fragment.",
  );
  process.exit(1);
}

execSync("npm run build:static", {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_BASE_PATH: "/",
    VITE_DEPLOY_TARGET: "",
    VITE_DUEL_WS_URL: endpoint.href,
  },
});

// Match manual packages: the deployed public operator config is authoritative.
writeFileSync(
  "dist/duel-config.js",
  "// Public operator endpoint; no player credentials.\n" +
    "window.__SRVPRO_DUEL_CONFIG__ = " +
    JSON.stringify({ duelWebSocketUrl: endpoint.href }) +
    ";\n",
);
writeFileSync(
  "dist/deployment-info.json",
  JSON.stringify(
    {
      target: "cloudflare-workers",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      builtAt: new Date().toISOString(),
      duelWebSocketUrl: endpoint.href,
    },
    null,
    2,
  ) + "\n",
);
