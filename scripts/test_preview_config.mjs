import assert from "node:assert/strict";
import { wranglerInvocation } from "./release_cloudflare.mjs";

const name = "codex-client-preview-20261019";
for (const npmCli of ["C:/node/npm-cli.js", undefined]) {
  const preview = wranglerInvocation("preview", npmCli);
  assert.deepEqual(preview.args.slice(-3), ["preview", "--name", name], "Preview name must remain stable across branches");
  assert.equal(wranglerInvocation("deploy", npmCli).args.at(-1), "deploy");
}

const { cloudflarePublicConfig, isPreviewBuild, previewConfig, releaseSkipReason } = await import("./preview_config.mjs");
const environment = { WORKERS_CI: "1", WORKERS_CI_BRANCH: "codex/a-new-test", VITE_DUEL_WS_URL: "wss://old.example.test/neos" };
const source = { target: "cloudflare-workers", sourceCommit: "a".repeat(40), duelWebSocketUrl: "wss://current.example.test/neos" };
let requests = 0;
const fetcher = async (url, options) => {
  requests++;
  assert.equal(url, previewConfig.publicConfigUrl);
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  return new Response(JSON.stringify(source));
};
assert.equal(isPreviewBuild(environment), true);
assert.equal(isPreviewBuild({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" }), false);
assert.equal(isPreviewBuild({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "preview" }), true);
const ci = (branch) => ({ WORKERS_CI: "1", WORKERS_CI_BRANCH: branch });
assert.equal(releaseSkipReason("preview", ci("preview")), undefined, "Only the preview branch updates the shared test site");
assert.equal(releaseSkipReason("deploy", ci("main")), undefined);
for (const branch of ["main", "deploy/cloudflare", "fix/a-small-patch", "feat/a-large-feature"])
  assert.match(releaseSkipReason("preview", ci(branch)), /Skipping/, `${branch} must not replace the test site`);
for (const branch of ["preview", "deploy/cloudflare", "fix/a-small-patch"])
  assert.match(releaseSkipReason("deploy", ci(branch)), /Skipping/, `${branch} must not go live`);
assert.equal(releaseSkipReason("preview", {}), undefined, "Manual releases stay explicit");
assert.throws(() => releaseSkipReason("preview", { WORKERS_CI: "1" }), /branch/i);
assert.equal(isPreviewBuild({ SRVPRO_BUILD_TARGET: "preview" }), true);
assert.equal(isPreviewBuild({}), false);
assert.throws(() => isPreviewBuild({ WORKERS_CI: "1" }), /branch/i);
assert.equal((await cloudflarePublicConfig(environment, fetcher)).duelWebSocketUrl, source.duelWebSocketUrl);
assert.equal((await cloudflarePublicConfig({ ...environment, VITE_DUEL_WS_URL: "" }, fetcher)).duelWebSocketUrl, source.duelWebSocketUrl);
const beforeProduction = requests;
assert.equal((await cloudflarePublicConfig({ ...environment, WORKERS_CI_BRANCH: "main" }, fetcher)).duelWebSocketUrl, environment.VITE_DUEL_WS_URL);
assert.equal(requests, beforeProduction, "Production must not request or inherit preview configuration");
await assert.rejects(cloudflarePublicConfig({ WORKERS_CI: "1", WORKERS_CI_BRANCH: "main" }, fetcher), /VITE_DUEL_WS_URL/);
for (const response of [
  () => new Response("Unavailable", { status: 503 }),
  () => new Response("<html>broken</html>"),
  () => new Response(JSON.stringify({ ...source, target: "other" })),
  () => new Response(JSON.stringify({ ...source, sourceCommit: "invalid" })),
  () => new Response(JSON.stringify({ ...source, duelWebSocketUrl: "http://unsafe.test" })),
  () => new Response(JSON.stringify({ ...source, duelWebSocketUrl: "wss://user:password@unsafe.test/neos" })),
  () => new Response("x".repeat(65537)),
]) await assert.rejects(cloudflarePublicConfig(environment, async () => response()));
await assert.rejects(cloudflarePublicConfig(environment, async () => { throw new Error("offline"); }), /offline/);
console.log("PASS fixed preview name, future branches, fresh WSS, production isolation and fail-closed metadata validation");
