export const deckImportLimits = { bytes: 65536, cards: 300, url: 4096 };

export interface DeckLists {
  main: number[];
  extra: number[];
  side: number[];
}

export type DeckImportInput =
  | { format: "ydk"; text: string }
  | { format: "ygopro-update-deck"; bytes: Uint8Array }
  | { format: "deck-json"; deck: unknown };

export type DeckImportErrorCode =
  | "invalid-link"
  | "too-large"
  | "invalid-format"
  | "invalid-card"
  | "empty-deck"
  | "unknown-zones"
  | "bridge-unavailable"
  | "bridge-timeout"
  | "source-denied";

export class DeckImportError extends Error {
  readonly code: DeckImportErrorCode;
  readonly cardIds: number[];

  constructor(code: DeckImportErrorCode, cardIds: number[] = []) {
    // Never include the received deck or URL in errors and diagnostics.
    super(code);
    this.name = "DeckImportError";
    this.code = code;
    this.cardIds = cardIds;
  }
}

function assertCard(id: unknown): asserts id is number {
  if (!Number.isInteger(id) || Number(id) <= 0 || Number(id) > 0xffffffff)
    throw new DeckImportError("invalid-card");
}

export function validateDeckLists(value: unknown): DeckLists {
  if (!value || typeof value !== "object")
    throw new DeckImportError("invalid-format");
  const fields = value as Record<string, unknown>;
  const deck: DeckLists = { main: [], extra: [], side: [] };
  let count = 0;
  for (const zone of ["main", "extra", "side"] as const) {
    const cards = fields[zone];
    if (!Array.isArray(cards)) throw new DeckImportError("invalid-format");
    count += cards.length;
    if (count > deckImportLimits.cards) throw new DeckImportError("too-large");
    for (const id of cards) {
      assertCard(id);
      deck[zone].push(id);
    }
  }
  if (!count) throw new DeckImportError("empty-deck");
  return deck;
}

export function parseDeckInput(
  input: DeckImportInput,
  classify: (id: number) => "main" | "extra" | undefined = () => undefined,
): DeckLists {
  if (input.format === "deck-json") return validateDeckLists(input.deck);
  if (input.format === "ydk") {
    if (new TextEncoder().encode(input.text).length > deckImportLimits.bytes)
      throw new DeckImportError("too-large");
    const deck: DeckLists = { main: [], extra: [], side: [] };
    let zone: keyof DeckLists | undefined;
    const seen = new Set<string>();
    let count = 0;
    for (const raw of input.text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const line = raw.trim();
      const next =
        line === "#main"
          ? "main"
          : line === "#extra"
          ? "extra"
          : line === "!side"
          ? "side"
          : undefined;
      if (next) {
        if (seen.has(next)) throw new DeckImportError("invalid-format");
        seen.add(next);
        zone = next;
      } else if (!line || line.startsWith("#")) {
        continue;
      } else {
        if (!zone || !/^\d+$/.test(line))
          throw new DeckImportError("invalid-format");
        const id = Number(line);
        assertCard(id);
        if (++count > deckImportLimits.cards)
          throw new DeckImportError("too-large");
        deck[zone].push(id);
      }
    }
    if (!seen.has("main")) throw new DeckImportError("invalid-format");
    return validateDeckLists(deck);
  }
  const bytes = input.bytes;
  if (bytes.byteLength > deckImportLimits.bytes)
    throw new DeckImportError("too-large");
  if (bytes.byteLength < 8) throw new DeckImportError("invalid-format");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const combinedCount = view.getUint32(0, true);
  const sideCount = view.getUint32(4, true);
  if (combinedCount + sideCount > deckImportLimits.cards)
    throw new DeckImportError("too-large");
  if (bytes.byteLength !== 8 + (combinedCount + sideCount) * 4)
    throw new DeckImportError("invalid-format");
  const deck: DeckLists = { main: [], extra: [], side: [] };
  const missing = new Set<number>();
  for (let i = 0; i < combinedCount + sideCount; i++) {
    const id = view.getUint32(8 + i * 4, true);
    assertCard(id);
    if (i >= combinedCount) deck.side.push(id);
    else {
      const zone = classify(id);
      if (zone) deck[zone].push(id);
      else missing.add(id);
    }
  }
  if (missing.size) throw new DeckImportError("unknown-zones", [...missing]);
  return validateDeckLists(deck);
}

export function deckImportTitle(title: string) {
  return title
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim()
    .replace(/\.ydk$/i, "")
    .slice(0, 120);
}

export function base64urlEncode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64urlDecode(value: string): Uint8Array {
  if (value.length > Math.ceil(deckImportLimits.bytes / 3) * 4)
    throw new DeckImportError("too-large");
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
    throw new DeckImportError("invalid-format");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(
      atob(value.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0),
    );
  } catch {
    throw new DeckImportError("invalid-format");
  }
  if (bytes.length > deckImportLimits.bytes)
    throw new DeckImportError("too-large");
  if (base64urlEncode(bytes) !== value)
    throw new DeckImportError("invalid-format");
  return bytes;
}

export function inputFromEncoded(
  format: string,
  data: string,
): DeckImportInput {
  const bytes = base64urlDecode(data);
  if (format === "ygopro-update-deck-base64url")
    return { format: "ygopro-update-deck", bytes };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DeckImportError("invalid-format");
  }
  if (format === "ydk-utf8-base64url") return { format: "ydk", text };
  if (format === "deck-json-base64url") {
    try {
      return { format: "deck-json", deck: JSON.parse(text) };
    } catch {
      throw new DeckImportError("invalid-format");
    }
  }
  throw new DeckImportError("invalid-format");
}

/** Public decks only. Preserve static publishing subpaths and use no remote URL. */
export function createDeckImportUrl(
  entry: string,
  input: DeckImportInput,
  title = "",
) {
  const url = new URL(entry);
  const encoded =
    input.format === "ygopro-update-deck"
      ? input.bytes
      : new TextEncoder().encode(
          input.format === "ydk" ? input.text : JSON.stringify(input.deck),
        );
  if (encoded.length > deckImportLimits.bytes)
    throw new DeckImportError("too-large");
  const format =
    input.format === "ydk" ? "ydk-utf8-base64url" : `${input.format}-base64url`;
  url.hash = `/import?${new URLSearchParams({
    v: "1",
    kind: "deck",
    format,
    data: base64urlEncode(encoded),
    title: deckImportTitle(title),
  })}`;
  if (url.href.length > deckImportLimits.url)
    throw new DeckImportError("too-large");
  return url.href;
}
