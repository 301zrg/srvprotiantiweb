import { storageKey } from "@/variant/deployment";
import type { HostInfo } from "@/variant/hostInfo";

import { inspectReplay, type ReplayHeader, safeReplayName } from "./format";
import { sha256 } from "./hash";

export interface ReplayEntry {
  id: string;
  hash: string;
  title: string;
  filename: string;
  createdAt: number;
  bytes: number;
  header: ReplayHeader;
  source: "import" | "duel";
  temporary?: boolean;
}
export interface ReplayOccurrence {
  id: string;
  entry: string;
  session: string;
  order: number;
  room: string;
  nickname: string;
  receivedAt: number;
  profile: string;
  host?: HostInfo;
}
const memory = new Map<string, { entry: ReplayEntry; blob: Blob }>();
const listeners = new Set<() => void>();
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(storageKey("replay-library"))
    : undefined;
channel?.addEventListener("message", () => listeners.forEach((fn) => fn()));
const changed = () => {
  listeners.forEach((fn) => fn());
  channel?.postMessage("changed");
};
export const subscribeReplays = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
let database: Promise<IDBDatabase> | undefined;
const req = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const done = (tx: IDBTransaction) => {
  const completion = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(tx.error || new Error("录像保存事务失败"));
  });
  // Attach a handler immediately: a quota abort can occur while another IDB
  // request rejects, before its caller reaches `await completion`.
  void completion.catch(() => {});
  return completion;
};
async function db() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(storageKey("srvpro-replays"), 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("blobs", { keyPath: "hash" });
      const entries = db.createObjectStore("entries", { keyPath: "id" });
      entries.createIndex("hash", "hash", { unique: true });
      const occurrences = db.createObjectStore("occurrences", {
        keyPath: "id",
      });
      occurrences.createIndex("entry", "entry");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("请关闭旧版录像页面后重试"));
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
  });
  try {
    return await database;
  } catch (error) {
    database = undefined;
    throw error;
  }
}
export async function listReplays(): Promise<ReplayEntry[]> {
  let entries: ReplayEntry[] = [];
  try {
    const tx = (await db()).transaction("entries", "readonly");
    entries = await req(tx.objectStore("entries").getAll());
  } catch {
    /* Memory fallback remains accessible. */
  }
  return [...entries, ...Array.from(memory.values(), (v) => v.entry)].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
}
export async function listReplayOccurrences(): Promise<ReplayOccurrence[]> {
  try {
    const tx = (await db()).transaction("occurrences", "readonly");
    return await req(tx.objectStore("occurrences").getAll());
  } catch {
    return [];
  }
}
export async function getReplay(
  id: string,
): Promise<{ entry: ReplayEntry; blob: Blob }> {
  if (memory.has(id)) return memory.get(id)!;
  const tx = (await db()).transaction(["entries", "blobs"], "readonly");
  const entry = await req<ReplayEntry>(tx.objectStore("entries").get(id));
  if (!entry) throw new Error("录像已在其他页面删除");
  const record = await req<{ blob: Blob }>(
    tx.objectStore("blobs").get(entry.hash),
  );
  if (!record) throw new Error("录像原件不存在");
  return { entry, blob: record.blob };
}
export async function saveReplay(
  bytes: Uint8Array,
  filename: string,
  occurrence?: Omit<ReplayOccurrence, "id" | "entry">,
): Promise<ReplayEntry> {
  const header = inspectReplay(bytes, filename);
  const hash = await sha256(bytes);
  const safe = safeReplayName(filename);
  const candidate: ReplayEntry = {
    id: crypto.randomUUID(),
    hash,
    title: safe.replace(/\.(yrp|yrp3d)$/i, ""),
    filename: safe,
    bytes: bytes.length,
    createdAt: Date.now(),
    header,
    source: occurrence ? "duel" : "import",
  };
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  let transaction: IDBTransaction | undefined;
  try {
    const tx = (await db()).transaction(
      ["entries", "blobs", "occurrences"],
      "readwrite",
    );
    transaction = tx;
    const completion = done(tx);
    // Hashing finishes before the transaction starts. All following awaits are
    // IDB requests, so no network/crypto can let this transaction auto-commit.
    const entries = tx.objectStore("entries"),
      blobs = tx.objectStore("blobs");
    const prior = await req<ReplayEntry | undefined>(
      entries.index("hash").get(hash),
    );
    const entry = prior || candidate;
    if (!prior) {
      const all = await req<{ bytes: number }[]>(blobs.getAll());
      if (
        all.reduce((n, b) => n + b.bytes, 0) + bytes.length >
        100 * 1024 * 1024
      ) {
        tx.abort();
        await completion.catch(() => {});
        throw new Error("本地录像库已达 100 MB，请下载备份后清理");
      }
      blobs.put({ hash, blob, bytes: bytes.length });
      entries.put(entry);
    }
    if (occurrence) {
      const id = `${occurrence.session}:${hash}`;
      const occurrences = tx.objectStore("occurrences");
      if (!(await req(occurrences.get(id))))
        occurrences.put({ ...occurrence, id, entry: entry.id });
    }
    await completion;
    changed();
    return entry;
  } catch (error) {
    try {
      transaction?.abort();
    } catch {
      /* Already completed/aborted. */
    }
    const existing = Array.from(memory.values()).find(
      (v) => v.entry.hash === hash,
    );
    if (existing) return existing.entry;
    if (
      Array.from(memory.values()).reduce((n, v) => n + v.entry.bytes, 0) +
        bytes.length >
      8 * 1024 * 1024
    )
      throw new Error("保存失败且临时缓存已满，请清理录像库后重试");
    candidate.temporary = true;
    memory.set(candidate.id, { entry: candidate, blob });
    changed();
    return candidate;
  }
}
export async function renameReplay(id: string, title: string) {
  title = title
    .trim()
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 120);
  if (!title) throw new Error("标题不能为空");
  if (memory.has(id)) {
    memory.get(id)!.entry.title = title;
    changed();
    return;
  }
  const tx = (await db()).transaction("entries", "readwrite"),
    completion = done(tx),
    store = tx.objectStore("entries");
  const entry = await req<ReplayEntry>(store.get(id));
  if (entry) store.put({ ...entry, title });
  await completion;
  changed();
}
export async function deleteReplay(id: string) {
  if (memory.delete(id)) {
    changed();
    return;
  }
  const tx = (await db()).transaction(
      ["entries", "blobs", "occurrences"],
      "readwrite",
    ),
    completion = done(tx),
    entries = tx.objectStore("entries");
  const entry = await req<ReplayEntry | undefined>(entries.get(id));
  if (entry) {
    entries.delete(id);
    const refs = await req<number>(entries.index("hash").count(entry.hash));
    if (!refs) tx.objectStore("blobs").delete(entry.hash);
    const keys = await req<IDBValidKey[]>(
      tx.objectStore("occurrences").index("entry").getAllKeys(id),
    );
    for (const key of keys) tx.objectStore("occurrences").delete(key);
  }
  await completion;
  changed();
}
export async function downloadReplay(id: string, share = false) {
  const { entry, blob } = await getReplay(id);
  const name = safeReplayName(
    entry.title.replace(/\.(yrp|yrp3d)$/i, "") +
      (entry.header.format === "YRP3D" ? ".yrp3d" : ".yrp"),
  );
  const file = new File([blob], name, { type: "application/octet-stream" });
  if (share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: entry.title });
    return;
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (e) => {
    if (memory.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
