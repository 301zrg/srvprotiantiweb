import { publishedResourceName, siteStorage } from "./deployment";

declare global {
  interface Window {
    __SRVPRO_DUEL_CONFIG__?: { duelWebSocketUrl?: unknown };
  }
}

/** The operator fixes the endpoint; players cannot edit it in the UI. */
const publicConfig = window.__SRVPRO_DUEL_CONFIG__;
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

export const languages = ["cn", "en", "ja", "ko"] as const;
export type Language = (typeof languages)[number];
export const languageLocales: Record<Language, string> = {
  cn: "zh-CN",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function getLanguage(): Language {
  const stored = siteStorage.getItem("language");
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
