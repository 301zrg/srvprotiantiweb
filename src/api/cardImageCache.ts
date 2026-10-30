import { storageKey } from "@/variant/deployment";

/** Card art cache shared by every mode.
 *
 * The image host answers `302 + no-store` to changing CDN nodes, so the
 * browser's HTTP cache often re-downloads a card on the next visit. The final
 * images allow CORS, so the compressed files are kept in Cache Storage under
 * the entry URL (which carries the image language), bounded by count and by the
 * origin's quota. Runtime memory stays bounded too: decoded pixels belong to
 * the <img>/background elements, and object URLs are reference counted with a
 * small idle pool. Any failure falls back to the plain URL. */

const CACHE_NAME = storageKey("card-images-v1");
const MAX_ENTRIES = 600; // ~50 MB at the typical 80 KB per image
const TRIM_EVERY = 25;
const MAX_DOWNLOADS = 8;
const RETRY_AFTER = 60_000;
const IDLE_URLS = 150;
/** Leave the origin's quota to decks, replays and other storage. */
const QUOTA_SHARE = 0.6;

interface Live {
  url: string;
  refs: number;
}
const live = new Map<string, Live>();
const idle: string[] = [];
const pending = new Map<string, Promise<Blob | undefined>>();
const failed = new Map<string, number>();
const waiting: (() => void)[] = [];
let downloads = 0;
let writes = 0;
let roomCheckedAt = 0;
let roomOk = true;

const cacheStorage = () =>
  typeof caches !== "undefined" &&
  typeof window !== "undefined" &&
  window.isSecureContext
    ? caches
    : undefined;

async function openCache() {
  try {
    return await cacheStorage()?.open(CACHE_NAME);
  } catch {
    return undefined;
  }
}

async function slot() {
  if (downloads >= MAX_DOWNLOADS)
    await new Promise<void>((resolve) => waiting.push(resolve));
  downloads++;
}
function freeSlot() {
  downloads--;
  waiting.shift()?.();
}

/** Stop caching when the origin is close to its quota; keep playing. */
async function hasRoom() {
  const now = Date.now();
  if (now - roomCheckedAt < 30_000) return roomOk;
  roomCheckedAt = now;
  try {
    const estimate = await navigator.storage?.estimate?.();
    roomOk =
      !estimate?.quota || (estimate.usage ?? 0) < estimate.quota * QUOTA_SHARE;
  } catch {
    roomOk = true;
  }
  return roomOk;
}

/** Oldest entries first (Cache Storage keeps insertion order). */
async function trim(cache: Cache) {
  try {
    const keys = await cache.keys();
    const excess = keys.length - MAX_ENTRIES;
    if (excess > 0)
      await Promise.all(
        keys.slice(0, excess + TRIM_EVERY).map((key) => cache.delete(key)),
      );
  } catch {
    // Trimming is best effort.
  }
}

async function store(cache: Cache, src: string, blob: Blob) {
  try {
    if (!(await hasRoom())) return;
    await cache.put(
      src,
      new Response(blob, { headers: { "Content-Type": blob.type } }),
    );
    if (++writes % TRIM_EVERY === 0) await trim(cache);
  } catch {
    // QuotaExceededError and friends: keep the image in memory only.
    roomOk = false;
    roomCheckedAt = Date.now();
  }
}

async function load(src: string): Promise<Blob | undefined> {
  const cache = await openCache();
  try {
    const hit = await cache?.match(src);
    if (hit) {
      const blob = await hit.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    // A damaged entry is replaced by a fresh download below.
  }
  await slot();
  try {
    const response = await fetch(src, { mode: "cors", credentials: "omit" });
    const blob = response.ok ? await response.blob() : undefined;
    if (!blob || blob.size === 0 || !blob.type.startsWith("image/")) {
      failed.set(src, Date.now());
      return undefined;
    }
    if (cache) void store(cache, src, blob);
    return blob;
  } catch {
    failed.set(src, Date.now());
    return undefined;
  } finally {
    freeSlot();
  }
}

function unidle(src: string) {
  const index = idle.indexOf(src);
  if (index >= 0) idle.splice(index, 1);
}

/** An object URL already in memory, for a first paint without flicker. */
export function cachedCardImage(src: string) {
  return live.get(src)?.url;
}

/** Resolve a card image. `owned` URLs must be released with releaseCardImage;
 * otherwise `url` is the original address for the browser to load itself. */
export async function acquireCardImage(
  src: string,
): Promise<{ url: string; owned: boolean }> {
  const current = live.get(src);
  if (current) {
    if (current.refs++ === 0) unidle(src);
    return { url: current.url, owned: true };
  }
  const failedAt = failed.get(src);
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER)
    return { url: src, owned: false };
  let request = pending.get(src);
  if (!request) {
    request = load(src).finally(() => pending.delete(src));
    pending.set(src, request);
  }
  const blob = await request;
  if (!blob) return { url: src, owned: false };
  failed.delete(src);
  const again = live.get(src);
  if (again) {
    if (again.refs++ === 0) unidle(src);
    return { url: again.url, owned: true };
  }
  const url = URL.createObjectURL(blob);
  live.set(src, { url, refs: 1 });
  return { url, owned: true };
}

export function releaseCardImage(src: string) {
  const current = live.get(src);
  if (!current || --current.refs > 0) return;
  idle.push(src);
  // Keep recently used images for quick reuse; free the rest.
  while (idle.length > IDLE_URLS) {
    const oldest = idle.shift()!;
    const entry = live.get(oldest);
    if (entry && entry.refs === 0) {
      URL.revokeObjectURL(entry.url);
      live.delete(oldest);
    }
  }
}

/** Remove only the card art cache; decks, replays and inputs stay. */
export async function clearCardImageCache() {
  for (const src of idle.splice(0)) {
    const entry = live.get(src);
    if (entry && entry.refs === 0) {
      URL.revokeObjectURL(entry.url);
      live.delete(src);
    }
  }
  failed.clear();
  writes = 0;
  roomCheckedAt = 0;
  try {
    return (await cacheStorage()?.delete(CACHE_NAME)) ?? false;
  } catch {
    return false;
  }
}
