import messages from "./preview-messages.json";

/** Copy for the approved client update; keep the four language keys aligned. */
export function previewMessages(language: string) {
  return messages[language as keyof typeof messages] ?? messages.en;
}

export function previewFormat(
  text: string,
  values: Record<string, string | number>,
) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    String(values[key] ?? match),
  );
}
