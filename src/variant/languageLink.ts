export const languages = ["cn", "en", "ja", "ko"] as const;
export type Language = (typeof languages)[number];
export const languageLocales: Record<Language, string> = {
  cn: "zh-CN",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function normalizeLinkLanguage(
  value: string | null,
): Language | undefined {
  switch (value?.trim().toLowerCase()) {
    case "zh":
    case "cn":
    case "zh-cn":
      return "cn";
    case "en":
    case "en-us":
      return "en";
    case "ja":
    case "ja-jp":
      return "ja";
    case "ko":
    case "ko-kr":
      return "ko";
    default:
      return undefined;
  }
}

function hashParameters(url: URL): URLSearchParams {
  const separator = url.hash.indexOf("?");
  return new URLSearchParams(
    separator < 0 ? "" : url.hash.slice(separator + 1),
  );
}

/** Read before deck/replay import removes its hash payload. */
export function readLanguageLink(url: URL): Language | undefined {
  return (
    normalizeLinkLanguage(hashParameters(url).get("lang")) ??
    normalizeLinkLanguage(url.searchParams.get("lang"))
  );
}

/** A manual switch must survive refreshing a link with an initial language. */
export function updateLanguageLink(url: URL, language: Language): URL {
  const updated = new URL(url.href);
  const value = language === "cn" ? "zh" : language;
  if (updated.searchParams.has("lang")) updated.searchParams.set("lang", value);
  const hash = hashParameters(updated);
  if (hash.has("lang")) {
    hash.set("lang", value);
    updated.hash = `${updated.hash.slice(
      0,
      updated.hash.indexOf("?"),
    )}?${hash}`;
  }
  return updated;
}
