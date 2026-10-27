import { readFileSync } from "node:fs";
import { publicOperatorConfigFromEnvironment } from "./public_operator_config.mjs";

// One named preview preserves its origin and browser storage across feature branches.
export const previewConfig = Object.freeze(JSON.parse(readFileSync(new URL("../deployment/preview.json", import.meta.url), "utf8")));
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(previewConfig.name) ||
    typeof previewConfig.productionBranch !== "string" || !previewConfig.productionBranch ||
    new URL(previewConfig.publicConfigUrl).protocol !== "https:")
  throw new Error("Invalid fixed preview configuration");

export function isPreviewBuild(environment = process.env) {
  if (environment.WORKERS_CI === "1") {
    if (!environment.WORKERS_CI_BRANCH) throw new Error("Workers CI branch is required to isolate preview from production");
    return environment.WORKERS_CI_BRANCH !== previewConfig.productionBranch;
  }
  return environment.SRVPRO_BUILD_TARGET === "preview";
}

export async function cloudflarePublicConfig(environment = process.env, fetcher = fetch) {
  if (!isPreviewBuild(environment))
    return publicOperatorConfigFromEnvironment(environment, { requireWss: true });

  // Follow the published public endpoint without copying any production credentials.
  // A failed lookup stops the build rather than publishing a stale or empty WSS URL.
  const response = await fetcher(previewConfig.publicConfigUrl, {
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Preview configuration request failed: HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Preview configuration body is unavailable");
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      throw new Error("Preview configuration exceeds the size limit");
    }
    parts.push(value);
  }
  const metadata = JSON.parse(Buffer.concat(parts).toString("utf8"));
  if (metadata.target !== "cloudflare-workers" || !/^[a-f0-9]{40}$/i.test(metadata.sourceCommit))
    throw new Error("Invalid published configuration metadata");
  return publicOperatorConfigFromEnvironment({
    ...environment, VITE_DUEL_WS_URL: metadata.duelWebSocketUrl,
  }, { requireWss: true });
}
