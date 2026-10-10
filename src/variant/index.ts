import { publishedResourceName, siteStorage } from "./deployment";
import {
  type Language,
  languageLocales,
  languages,
  readLanguageLink,
  updateLanguageLink,
} from "./languageLink";

export { type Language, languageLocales, languages } from "./languageLink";

declare global {
  interface Window {
    __SRVPRO_DUEL_CONFIG__?: {
      duelWebSocketUrl?: unknown;
      deckImportOrigins?: unknown;
      websiteBaseUrl?: unknown;
    };
  }
}

/** The operator fixes the endpoint; players cannot edit it in the UI. */
const publicConfig = window.__SRVPRO_DUEL_CONFIG__;
const configuredDeckImportOrigins = publicConfig?.deckImportOrigins;
/** A link's origin parameter can choose from this list, never expand it. */
export const deckImportOrigins: string[] = (
  Array.isArray(configuredDeckImportOrigins)
    ? configuredDeckImportOrigins
    : ["http://121.4.34.71:7922", "https://duel.ygomatch.xyz"]
).filter((origin): origin is string => {
  if (typeof origin !== "string") return false;
  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
  } catch {
    return false;
  }
});
export const duelWebSocketUrl =
  publicConfig &&
  Object.prototype.hasOwnProperty.call(publicConfig, "duelWebSocketUrl")
    ? typeof publicConfig.duelWebSocketUrl === "string"
      ? publicConfig.duelWebSocketUrl.trim()
      : ""
    : (import.meta.env.VITE_DUEL_WS_URL ?? "").trim();

export const environmentId = "1103-201103-v1";
export const basePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
export const environmentPath = `${basePath}environment/${environmentId}`;
export const assetsPath = `${basePath}neos-assets`;

// Capture once, before import/room routing rewrites the URL. Later changes are
// explicit UI choices; re-reading the original parameter would undo them.
let currentLanguage = readLanguageLink(new URL(window.location.href));

export function getLanguage(): Language {
  if (currentLanguage) return currentLanguage;
  let stored: string | null = null;
  try {
    stored = siteStorage.getItem("language");
  } catch {
    // Private/restricted storage must not prevent opening a language link.
  }
  const selected = languages.find((language) => language === stored);
  if (selected) return selected;
  for (const preferred of navigator.languages) {
    const prefix = preferred.toLowerCase().split("-")[0];
    if (prefix === "zh") return "cn";
    if (prefix === "en") return "en";
    if (prefix === "ja") return "ja";
    if (prefix === "ko") return "ko";
  }
  return "en";
}

export function setLanguagePreference(language: Language): void {
  currentLanguage = language;
  try {
    siteStorage.setItem("language", language);
  } catch {
    // Keep the choice for this tab when persistent storage is unavailable.
  }
  const updated = updateLanguageLink(new URL(window.location.href), language);
  if (updated.href !== window.location.href)
    window.history.replaceState(window.history.state, "", updated);
}

export function getEnvironmentFile(
  file: "cards.cdb" | "strings.conf",
  language = getLanguage(),
) {
  return `${environmentPath}/${
    languageLocales[language]
  }/${publishedResourceName(file)}`;
}

export const banlistUrl = `${environmentPath}/${publishedResourceName(
  "lflist.conf",
)}`;

export function serverLanguageCommand(language: Language): string {
  return language === "cn" ? "/zh" : `/${language}`;
}

export function validateDuelWebSocketUrl(
  language: string = getLanguage(),
): string | undefined {
  const messages = siteMessages(language);
  if (!duelWebSocketUrl) return messages.missingWss;
  try {
    if (new URL(duelWebSocketUrl).protocol !== "wss:") {
      return messages.requireWss;
    }
  } catch {
    return messages.invalidWss;
  }
  return undefined;
}

import { siteMessages } from "./messages";
