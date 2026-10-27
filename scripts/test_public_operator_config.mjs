import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  publicOperatorConfigFromEnvironment,
  resolvePublicOperatorConfig,
  writePublicOperatorConfig,
} from "./public_operator_config.mjs";
import { defaultWebsiteBaseUrl, resolveWebsiteBaseUrl } from "../src/variant/websiteLink.ts";

const input = {
  duelWebSocketUrl: "wss://game.example.com/neos",
  deckImportOrigins: ["https://ladder.example.com", "http://127.0.0.1:7922"],
  websiteBaseUrl: "https://ladder.example.com/",
};

test("missing origins preserve legacy defaults; an explicit empty array disables message import", () => {
  assert.deepEqual(resolvePublicOperatorConfig({}), { duelWebSocketUrl: "" });
  assert.deepEqual(resolvePublicOperatorConfig({ deckImportOrigins: "[]" }), {
    duelWebSocketUrl: "", deckImportOrigins: [],
  });
  assert.throws(() => resolvePublicOperatorConfig({}, { requireWss: true }), /VITE_DUEL_WS_URL/);
  assert.equal(resolveWebsiteBaseUrl(undefined), defaultWebsiteBaseUrl);
});

test("published fields retain the exact import allowlist and migrated website URL", () => {
  const config = publicOperatorConfigFromEnvironment({
    VITE_DUEL_WS_URL: input.duelWebSocketUrl,
    VITE_DECK_IMPORT_ORIGINS: JSON.stringify(input.deckImportOrigins),
    VITE_WEBSITE_BASE_URL: input.websiteBaseUrl,
  }, { requireWss: true });
  assert.deepEqual(config, input);
  assert.equal(resolveWebsiteBaseUrl(config.websiteBaseUrl), input.websiteBaseUrl);
  const folder = mkdtempSync(resolve(tmpdir(), "srvpro-public-config-"));
  try {
    writePublicOperatorConfig(folder, config);
    const context = { window: {} };
    runInNewContext(readFileSync(resolve(folder, "duel-config.js"), "utf8"), context);
    assert.deepEqual(JSON.parse(JSON.stringify(context.window.__SRVPRO_DUEL_CONFIG__)), input);
  } finally {
    unlinkSync(resolve(folder, "duel-config.js"));
    rmdirSync(folder);
  }
});

test("origins reject paths, wildcard, normalization, credentials and malformed arrays", () => {
  for (const value of ["", "null", "{}", '"https://ladder.example.com"', "[broken]"])
    assert.throws(() => resolvePublicOperatorConfig({ deckImportOrigins: value }));
  for (const origin of [
    "https://ladder.example.com/", "https://ladder.example.com/path", "https://*.example.com",
    "https://name:pass@ladder.example.com", "https://ladder.example.com?x=1", "null",
    "file:///tmp", "https://LADDER.example.com", "https://ladder.example.com:443", 123, null,
  ]) assert.throws(() => resolvePublicOperatorConfig({ deckImportOrigins: [origin] }));
});

test("endpoints and navigation URLs reject unsafe or ambiguous forms", () => {
  for (const url of ["ws://game.example.com/neos", "wss://name:pass@game.example.com/neos",
    "wss://@game.example.com/neos", "wss://game.example.com/neos?", "wss://game.example.com/neos#",
    "wss://game.example.com/ne os", "wss:\\game.example.com\\neos", "wss:////game.example.com"])
    assert.throws(() => resolvePublicOperatorConfig({ duelWebSocketUrl: url }));
  for (const url of ["javascript:alert(1)", "https://name:pass@ladder.example.com", "https://@ladder.example.com",
    "https://ladder.example.com?", "https://ladder.example.com#", "https:////ladder.example.com", 12, null]) {
    assert.throws(() => resolvePublicOperatorConfig({ websiteBaseUrl: url }));
    assert.equal(resolveWebsiteBaseUrl(url), defaultWebsiteBaseUrl);
  }
  assert.equal(resolveWebsiteBaseUrl("https://ladder.example.com/ladder/"), "https://ladder.example.com/ladder/");
});

test("both Python packagers share Node validation; explicit CLI input overrides environment", () => {
  const environment = { ...process.env, VITE_DUEL_WS_URL: input.duelWebSocketUrl,
    VITE_DECK_IMPORT_ORIGINS: JSON.stringify(input.deckImportOrigins), VITE_WEBSITE_BASE_URL: input.websiteBaseUrl };
  const code = `import argparse,json,sys
sys.path.insert(0,sys.argv[1])
from public_operator_config import add_public_config_arguments,resolve_public_config
p=argparse.ArgumentParser();add_public_config_arguments(p)
print(json.dumps(resolve_public_config(p.parse_args(sys.argv[2:]),p)))`;
  const call = (...args) => spawnSync("python", ["-c", code, resolve("scripts"), ...args],
    { encoding: "utf8", env: environment });
  const inherited = call();
  assert.equal(inherited.status, 0, String(inherited.error || inherited.stderr));
  assert.deepEqual(JSON.parse(inherited.stdout), input);
  const disabled = call("--wss-url", "", "--deck-import-origins", "[]");
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.deepEqual(JSON.parse(disabled.stdout), {
    duelWebSocketUrl: "", deckImportOrigins: [], websiteBaseUrl: input.websiteBaseUrl,
  });
  const invalid = call("--deck-import-origins", '["https://ladder.example.com/path"]');
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /exact/);
});

test("Cloudflare rejects an invalid whitelist before changing the existing dist config", () => {
  let before;
  try { before = readFileSync("dist/duel-config.js"); } catch { /* Dist is optional. */ }
  const result = spawnSync(process.execPath, ["scripts/build_cloudflare.mjs"], {
    encoding: "utf8", env: { ...process.env, VITE_DUEL_WS_URL: input.duelWebSocketUrl,
      VITE_DECK_IMPORT_ORIGINS: '["https://*.example.com"]' },
  });
  assert.equal(result.status, 1, String(result.error || result.stderr));
  assert.match(result.stderr, /origin|URL/);
  if (before) assert.deepEqual(readFileSync("dist/duel-config.js"), before);
});

test("both actual Python release entrypoints reject bad public input before making a release", () => {
  const releases = () => existsSync("releases") ? readdirSync("releases").sort() : [];
  const before = releases();
  for (const script of ["package_test_release.py", "package_bilitoy_release.py"]) {
    const result = spawnSync("python", ["scripts/" + script], {
      encoding: "utf8", env: { ...process.env, VITE_DUEL_WS_URL: input.duelWebSocketUrl,
        VITE_DECK_IMPORT_ORIGINS: '["https://ladder.example.com/path"]' },
    });
    assert.equal(result.status, 2, String(result.error || result.stderr));
    assert.match(result.stderr, /exact/);
    assert.deepEqual(releases(), before);
  }
});
