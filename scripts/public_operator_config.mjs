import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// All release routes use this validator. These values are public deployment
// settings, never player credentials or private server configuration.
function publicUrl(value, protocols, label) {
  if (typeof value !== "string" || !value.trim() || /[\s\\]/u.test(value.trim()) ||
      !/^[a-z]+:\/\/[^/]/iu.test(value.trim())) {
    throw new Error(`${label} must be a complete URL without whitespace or backslashes.`);
  }
  const url = new URL(value.trim());
  if (!protocols.includes(url.protocol) || !url.hostname || url.hostname.includes("*") ||
      url.username || url.password || value.split("/")[2]?.includes("@") ||
      value.includes("?") || value.includes("#")) {
    throw new Error(`${label} must use ${protocols.join(" or ")} without credentials, a query or a fragment.`);
  }
  return url;
}

export function resolvePublicOperatorConfig(input, { requireWss = false } = {}) {
  const config = {};
  const endpoint = input.duelWebSocketUrl?.trim() || "";
  if (requireWss && !endpoint) throw new Error("Set VITE_DUEL_WS_URL to the public wss:// endpoint.");
  config.duelWebSocketUrl = endpoint ? publicUrl(endpoint, ["wss:"], "WSS endpoint").href : "";

  if (input.deckImportOrigins !== undefined) {
    let origins = input.deckImportOrigins;
    if (typeof origins === "string") {
      try { origins = JSON.parse(origins); }
      catch { throw new Error("VITE_DECK_IMPORT_ORIGINS / --deck-import-origins must be a JSON array."); }
    }
    if (!Array.isArray(origins)) throw new Error("deckImportOrigins must be an array of exact origins; [] disables the bridge.");
    config.deckImportOrigins = origins.map((origin) => {
      const url = publicUrl(origin, ["http:", "https:"], "Deck/replay import origin");
      if (url.origin !== origin) throw new Error("Import origins must be exact: no path, trailing slash, wildcard or URL normalization.");
      return origin;
    });
    config.deckImportOrigins = [...new Set(config.deckImportOrigins)];
  }

  if (input.websiteBaseUrl !== undefined) {
    config.websiteBaseUrl = publicUrl(input.websiteBaseUrl, ["http:", "https:"], "Website URL").href;
  }
  return config;
}

export function publicOperatorConfigFromEnvironment(environment = process.env, options) {
  return resolvePublicOperatorConfig({
    duelWebSocketUrl: environment.VITE_DUEL_WS_URL,
    deckImportOrigins: environment.VITE_DECK_IMPORT_ORIGINS,
    websiteBaseUrl: environment.VITE_WEBSITE_BASE_URL,
  }, options);
}

export function writePublicOperatorConfig(folder, config) {
  writeFileSync(resolve(folder, "duel-config.js"),
    "// Public operator configuration; no player credentials.\n" +
    "window.__SRVPRO_DUEL_CONFIG__ = " + JSON.stringify(config) + ";\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: {
      "wss-url": { type: "string" },
      "deck-import-origins": { type: "string" },
      "website-base-url": { type: "string" },
    } });
    const config = resolvePublicOperatorConfig({
      duelWebSocketUrl: values["wss-url"] ?? process.env.VITE_DUEL_WS_URL,
      deckImportOrigins: values["deck-import-origins"] ?? process.env.VITE_DECK_IMPORT_ORIGINS,
      websiteBaseUrl: values["website-base-url"] ?? process.env.VITE_WEBSITE_BASE_URL,
    });
    process.stdout.write(JSON.stringify(config) + "\n");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
