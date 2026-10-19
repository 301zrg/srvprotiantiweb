import { sha256 } from "./hash";

export interface ReplayRuntime {
  HEAPU8: Uint8Array;
  UTF8ToString(p: number): string;
  [key: string]: any;
}
export interface ReplayProfile {
  revision: string;
  unpackedScriptBytes: number;
  cardCount: number;
  files: Record<string, { bytes: number; sha256: string }>;
}

export async function loadReplayResource(
  base: string,
  profile: ReplayProfile,
  name: string,
  status: (text: string) => void,
): Promise<Uint8Array> {
  const record = profile.files[name];
  if (
    !record ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes < 0 ||
    record.bytes > 16 * 1024 * 1024
  )
    throw new Error("播放资源清单异常");
  const url = new URL(name, base).href;
  status(`正在加载 ${name}`);
  let cache: Cache | undefined;
  try {
    cache = await caches.open("srvpro-replay-706-v1");
  } catch {
    /* Storage may be disabled. */
  }
  let response = await cache?.match(url);
  const read = async (r: Response) => {
    if (!r.ok) throw new Error(`播放资源请求失败：${r.status}`);
    const reader = r.body?.getReader();
    if (!reader) throw new Error("资源流不可用");
    const parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > record.bytes) {
        await reader.cancel();
        throw new Error("播放资源超限");
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let p = 0;
    for (const part of parts) {
      bytes.set(part, p);
      p += part.length;
    }
    if (size !== record.bytes || (await sha256(bytes)) !== record.sha256)
      throw new Error("播放资源校验失败");
    return bytes;
  };
  if (response) {
    try {
      return await read(response);
    } catch {
      await cache?.delete(url);
    }
  }
  response = await fetch(url, { cache: "no-store" });
  const bytes = await read(response);
  try {
    await cache?.put(url, new Response(bytes));
  } catch {
    /* Playback does not require caching. */
  }
  return bytes;
}

export async function loadReplayRuntime(
  base: string,
  profile: ReplayProfile,
  status: (text: string) => void,
): Promise<ReplayRuntime> {
  const [js, wasm] = await Promise.all([
    loadReplayResource(base, profile, "ocgcore.js", status),
    loadReplayResource(base, profile, "ocgcore.wasm", status),
  ]);
  const moduleUrl = URL.createObjectURL(
    new Blob([js], { type: "text/javascript" }),
  );
  try {
    const factory = (await import(/* @vite-ignore */ moduleUrl)).default;
    return await factory({
      wasmBinary: wasm,
      locateFile: (name: string) => new URL(name, base).href,
      printErr: () => {},
    });
  } finally {
    URL.revokeObjectURL(moduleUrl);
  }
}
