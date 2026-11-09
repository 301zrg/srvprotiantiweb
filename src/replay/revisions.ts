// Rule environments for replay playback (plan 02 §2, §3.2, §3.5).
// Each environment is a delta over the immutable 706-v1 script bundle. The
// bundled index pins every environment profile by SHA-256; the profile pins
// its delta. Nothing here contacts GitHub.
import { Gunzip } from "fflate";

import { sha256 } from "./hash";
import v1 from "./profile.json";
import index from "./revisions.json";
import { loadVerifiedBytes } from "./runtime";

export interface EnvironmentEntry {
  id: string;
  effectiveFromUnix: number | null;
  profileSha256: string;
}
export interface EnvironmentSelection {
  id: string;
  /** auto: picked from the replay's start time; fallback: could not tell, newest used. */
  basis: "auto" | "fallback";
  reason?: "no-timestamp" | "future";
}

const HASH = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9_.-]{1,80}\.lua$/;

/** Rejects a table that breaks 02 §2: unique ids, only the first start is null, strictly increasing. */
export function validateEnvironments(list: unknown): EnvironmentEntry[] {
  if (!Array.isArray(list) || !list.length || list.length > 1000)
    throw new Error("规则环境表异常");
  const seen = new Set<string>();
  list.forEach((e: EnvironmentEntry, i) => {
    if (
      !e ||
      typeof e.id !== "string" ||
      !/^706-\d{8}(-\d+)?$/.test(e.id) ||
      seen.has(e.id) ||
      !HASH.test(e.profileSha256) ||
      (i === 0
        ? e.effectiveFromUnix !== null
        : !Number.isSafeInteger(e.effectiveFromUnix) ||
          (i > 1 && !((e.effectiveFromUnix as number) > (list[i - 1].effectiveFromUnix as number))))
    )
      throw new Error("规则环境表异常");
    seen.add(e.id);
  });
  return list as EnvironmentEntry[];
}

export const environments = validateEnvironments(index.environments);
export const latestEnvironment = environments[environments.length - 1].id;

/** Last environment whose start is at or before the replay start; unknown times use the newest. */
export function selectEnvironment(
  timestamp: number,
  nowSeconds: number,
  list: EnvironmentEntry[] = environments,
): EnvironmentSelection {
  const newest = list[list.length - 1].id;
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0)
    return { id: newest, basis: "fallback", reason: "no-timestamp" };
  if (timestamp > nowSeconds + 86400)
    return { id: newest, basis: "fallback", reason: "future" };
  let id = list[0].id;
  for (const e of list)
    if (e.effectiveFromUnix === null || e.effectiveFromUnix <= timestamp) id = e.id;
  return { id, basis: "auto" };
}

interface RevisionProfile {
  format: 1;
  id: string;
  base: { revision: string; scriptsDataSha256: string };
  core: string;
  cardsDataSha256: string;
  delta: { bytes: number; sha256: string; unpackedBytes: number };
  limits: { maxFiles: number; maxFileBytes: number; maxUnpackedBytes: number };
}

function gunzipBounded(bytes: Uint8Array, expected: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  const gzip = new Gunzip((part) => {
    total += part.length;
    if (total > expected) throw new Error("差异包解压超限");
    parts.push(part);
  });
  for (let p = 0; p < bytes.length; p += 16384)
    gzip.push(bytes.subarray(p, p + 16384), p + 16384 >= bytes.length);
  if (total !== expected) throw new Error("差异包长度不匹配");
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function readIndex(bytes: Uint8Array): { header: any; dataStart: number } {
  if (bytes.length < 4) throw new Error("脚本包索引异常");
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true);
  if (length > 4 * 1024 * 1024 || length + 4 > bytes.length)
    throw new Error("脚本包索引长度异常");
  return {
    header: JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))),
    dataStart: 4 + length,
  };
}

/** Packs [name, bytes] pairs in the scripts.data layout ReplayEngine.install expects. */
function packScripts(files: [string, Uint8Array][]): Uint8Array {
  let offset = 0;
  const entries = files.map(([name, bytes]) => {
    const e = { name, offset, bytes: bytes.length };
    offset += bytes.length;
    return e;
  });
  const head = new TextEncoder().encode(JSON.stringify(entries));
  const out = new Uint8Array(4 + head.length + offset);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  let p = 4 + head.length;
  for (const [, bytes] of files) {
    out.set(bytes, p);
    p += bytes.length;
  }
  return out;
}

/** Applies a verified delta (already gunzipped) to the unpacked v1 bundle. */
export async function applyDelta(
  v1Unpacked: Uint8Array,
  deltaUnpacked: Uint8Array,
  limits: RevisionProfile["limits"],
): Promise<Uint8Array> {
  const base = readIndex(v1Unpacked);
  const files = new Map<string, Uint8Array>();
  for (const e of base.header as { name: string; offset: number; bytes: number }[])
    files.set(e.name, v1Unpacked.subarray(base.dataStart + e.offset, base.dataStart + e.offset + e.bytes));
  const { header: delta, dataStart } = readIndex(deltaUnpacked);
  if (
    !delta ||
    delta.base !== v1.files["scripts.data"].sha256 ||
    !Array.isArray(delta.set) ||
    !Array.isArray(delta.delete)
  )
    throw new Error("差异包底稿不符");
  const names = new Set<string>(), lower = new Set<string>();
  const claim = (name: unknown) => {
    if (typeof name !== "string" || !NAME.test(name) || name.includes(".."))
      throw new Error("差异包路径不规范");
    if (names.has(name) || lower.has(name.toLowerCase()))
      throw new Error("差异包名称重复或大小写冲突");
    names.add(name);
    lower.add(name.toLowerCase());
  };
  let end = 0;
  for (const e of delta.set) {
    claim(e?.name);
    if (
      e.offset !== end ||
      !Number.isSafeInteger(e.bytes) ||
      e.bytes < 0 ||
      e.bytes > limits.maxFileBytes ||
      dataStart + end + e.bytes > deltaUnpacked.length ||
      !HASH.test(e.sha256)
    )
      throw new Error("差异包偏移越界");
    end += e.bytes;
  }
  if (dataStart + end !== deltaUnpacked.length) throw new Error("差异包剩余数据异常");
  for (const name of delta.delete) {
    claim(name);
    if (!files.has(name)) throw new Error("差异包要删除的文件不存在");
  }
  for (const name of delta.delete) files.delete(name);
  const byLower = new Map([...files.keys()].map((n) => [n.toLowerCase(), n]));
  for (const e of delta.set) {
    const bytes = deltaUnpacked.subarray(dataStart + e.offset, dataStart + e.offset + e.bytes);
    if ((await sha256(bytes)) !== e.sha256) throw new Error("差异包文件校验失败");
    // A replacement must not differ from an existing name only by case.
    const existing = byLower.get(e.name.toLowerCase());
    if (existing !== undefined && existing !== e.name)
      throw new Error("差异包名称重复或大小写冲突");
    files.set(e.name, bytes);
  }
  if (files.size > limits.maxFiles) throw new Error("差异包文件数超限");
  const merged = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const total = merged.reduce((n, [, b]) => n + b.length, 0);
  if (total > 64 * 1024 * 1024) throw new Error("脚本总量超限");
  return packScripts(merged);
}

/**
 * A profile's size is only known once fetched, so it is bounded by a ceiling and pinned
 * by the bundled SHA. A verified cached copy is used first, so playback works offline.
 */
async function loadProfile(url: string, expected: string, cacheName: string): Promise<Uint8Array> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(cacheName);
  } catch {
    /* Storage may be disabled. */
  }
  const verify = async (r: Response | undefined) => {
    if (!r?.ok) return undefined;
    const bytes = new Uint8Array(await r.arrayBuffer());
    return bytes.length <= 64 * 1024 && (await sha256(bytes)) === expected ? bytes : undefined;
  };
  const cached = await verify(await cache?.match(url));
  if (cached) return cached;
  await cache?.delete(url);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`规则环境请求失败：${response.status}`);
  const bytes = await verify(response);
  if (!bytes) throw new Error("规则环境校验失败");
  try {
    await cache?.put(url, new Response(bytes));
  } catch {
    /* Playback does not require caching. */
  }
  return bytes;
}

/** Loads one environment's profile and delta, verifies the chain, and merges it into v1. */
export async function loadEnvironmentScripts(
  revisionsBase: string,
  id: string,
  v1Unpacked: Uint8Array,
  status: (text: string) => void,
): Promise<Uint8Array> {
  const entry = environments.find((e) => e.id === id);
  if (!entry) throw new Error(`规则环境 ${id} 不存在`);
  const cacheName = `srvpro-replay-rev-${id}`;
  status(`正在加载规则环境 ${id}`);
  const profileBytes = await loadProfile(
    new URL(`${id}/profile.json`, revisionsBase).href,
    entry.profileSha256,
    cacheName,
  );
  const p = JSON.parse(new TextDecoder().decode(profileBytes)) as RevisionProfile;
  if (
    p.format !== 1 ||
    p.id !== id ||
    p.base?.revision !== v1.revision ||
    p.base.scriptsDataSha256 !== v1.files["scripts.data"].sha256 ||
    p.core !== v1.core ||
    p.cardsDataSha256 !== v1.files["cards.data"].sha256 ||
    !(p.delta?.unpackedBytes > 0 && p.delta.unpackedBytes <= (p.limits?.maxUnpackedBytes ?? 0)) ||
    p.limits.maxUnpackedBytes > 64 * 1024 * 1024 ||
    p.limits.maxFiles > 20000 ||
    p.limits.maxFileBytes > 1024 * 1024
  )
    throw new Error("规则环境与底稿不符");
  const delta = await loadVerifiedBytes(new URL(`${id}/delta.data`, revisionsBase).href, p.delta, cacheName);
  return applyDelta(v1Unpacked, gunzipBounded(delta, p.delta.unpackedBytes), p.limits);
}
