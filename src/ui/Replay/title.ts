import { type Language, languageLocales } from "@/variant";

const words: Record<string, string> = {
  cn: "录像",
  en: "Replay",
  ja: "リプレイ",
  ko: "리플레이",
};

/** Replay titles come from file names that may hold player IDs in any form
 * (the server's "A VS B", a name typed in YGOPro, a rename here), so the
 * setting replaces every title with "Replay · date" instead of guessing. */
export function replayDisplayTitle(
  entry: { title: string; createdAt: number; header: { timestamp: number } },
  hidden: boolean,
  language: string,
) {
  if (!hidden) return entry.title;
  // The duel's own start time when the header has a plausible one.
  const recorded = entry.header.timestamp * 1000;
  const at =
    recorded > Date.UTC(2000, 0, 1) && recorded < Date.now() + 86_400_000
      ? recorded
      : entry.createdAt;
  const date = new Date(at).toLocaleString(
    languageLocales[language as Language],
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
  return `${words[language] ?? words.en} · ${date}`;
}
