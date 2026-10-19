import type { IDeck } from "@/stores/deckStore";

import { inspectReplay, parseReplayBody } from "./format";
import profile from "./profile.json";
import { loadReplayRuntime, type ReplayRuntime } from "./runtime";

export interface ExtractedReplayDeck extends IDeck {
  playerName: string;
}

export class UnsupportedReplayExtraction extends Error {}

interface ExtractOptions {
  title?: string;
  filename?: string;
  /** Allows callers with an already loaded, verified runtime to reuse it. */
  loadRuntime?: () => Promise<ReplayRuntime>;
}

/** Reads opening decks only. Never installs card/Lua data or creates a duel. */
export async function extractReplayDecks(
  bytes: Uint8Array,
  options: ExtractOptions = {},
): Promise<ExtractedReplayDeck[]> {
  const header = inspectReplay(bytes, options.filename);
  if (!header.playable) throw new UnsupportedReplayExtraction(header.reason);
  let body = bytes.subarray(header.headerSize);
  if (header.flags & 1) {
    const core = await (options.loadRuntime?.() ??
      loadReplayRuntime(
        new URL(`${import.meta.env.BASE_URL}replay/706-v1/`, document.baseURI)
          .href,
        profile,
        () => {},
      ));
    const allocated: number[] = [];
    const alloc = (size: number) => {
      const pointer = core._malloc(size || 1);
      if (!pointer) throw new Error("录像内存不足");
      allocated.push(pointer);
      return pointer;
    };
    try {
      const source = alloc(body.length);
      core.HEAPU8.set(body, source);
      const props = alloc(5);
      core.HEAPU8.set(bytes.subarray(24, 29), props);
      const output = alloc(header.bodySize);
      if (
        !core._replay_decode_lzma(
          source,
          body.length,
          props,
          output,
          header.bodySize,
        )
      )
        throw new Error("录像 LZMA 正文损坏");
      body = core.HEAPU8.slice(output, output + header.bodySize);
    } finally {
      for (const pointer of allocated) core._free(pointer);
    }
  }
  const parsed = parseReplayBody(body);
  if (parsed.decks.some((deck) => !deck.main.length))
    throw new Error("录像牌组长度异常");
  const title =
    options.title?.trim() ||
    options.filename?.replace(/\.(yrp|yrp3d)$/i, "") ||
    "replay";
  return parsed.decks.map((deck, player) => {
    const playerName = parsed.names[player] || String(player + 1);
    return {
      deckName: `${title} - ${playerName}`,
      playerName,
      main: deck.main,
      extra: deck.extra,
      side: [],
    };
  });
}

interface DeckLibrary {
  decks: readonly IDeck[];
  persistenceAvailable: boolean;
  add(deck: IDeck): Promise<boolean>;
}

/** add() uses an IDB add transaction, so a racing tab cannot be overwritten. */
export async function saveExtractedDeck(
  extracted: IDeck,
  library: DeckLibrary,
): Promise<IDeck> {
  for (let suffix = 1; suffix <= 1000; suffix++) {
    const deckName = extracted.deckName + (suffix === 1 ? "" : ` (${suffix})`);
    if (library.decks.some((deck) => deck.deckName === deckName)) continue;
    const fresh: IDeck = {
      deckName,
      main: [...extracted.main],
      extra: [...extracted.extra],
      side: [],
    };
    if (await library.add(fresh)) return fresh;
    if (!library.persistenceAvailable) break;
  }
  throw new Error("卡组保存失败");
}
