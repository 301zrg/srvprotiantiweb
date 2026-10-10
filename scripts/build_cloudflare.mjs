import { execFileSync, execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { publicOperatorConfigFromEnvironment, writePublicOperatorConfig } from "./public_operator_config.mjs";

// CI has no .env.local. A missing endpoint must fail before replacing the live site.
let publicConfig;
try {
  publicConfig = publicOperatorConfigFromEnvironment(process.env, { requireWss: true });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

execSync("npm run build:static", {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_BASE_PATH: "/",
    VITE_DEPLOY_TARGET: "",
    VITE_DUEL_WS_URL: publicConfig.duelWebSocketUrl,
  },
});

// Match manual packages: the deployed public operator config is authoritative.
writePublicOperatorConfig("dist", publicConfig);
writeFileSync(
  "dist/deployment-info.json",
  JSON.stringify(
    {
      target: "cloudflare-workers",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      builtAt: new Date().toISOString(),
      ...publicConfig,
    },
    null,
    2,
  ) + "\n",
);
