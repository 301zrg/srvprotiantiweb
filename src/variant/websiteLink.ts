export const defaultWebsiteBaseUrl = "http://121.4.34.71:7922/";

/** An operator-provided navigation URL cannot introduce script/credential URLs. */
export function resolveWebsiteBaseUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    /[\s\\]/u.test(value.trim()) ||
    !/^https?:\/\/[^/]/iu.test(value.trim())
  )
    return defaultWebsiteBaseUrl;
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.hostname.includes("*") ||
      url.username ||
      url.password ||
      value.split("/")[2]?.includes("@") ||
      value.includes("?") ||
      value.includes("#")
    )
      return defaultWebsiteBaseUrl;
    return url.href;
  } catch {
    return defaultWebsiteBaseUrl;
  }
}
