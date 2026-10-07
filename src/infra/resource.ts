/** Failures in static assets are distinct from component or session errors. */
export class ResourceLoadError extends Error {
  constructor(
    public readonly resource: string,
    cause: unknown,
  ) {
    super(
      `${resource}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "ResourceLoadError";
  }
}

/** Retry transient failures and bypass stale HTTP error/HTML cache entries. */
export async function loadResource<T>(
  resource: string,
  read: (response: Response) => Promise<T>,
  refreshCache = false,
): Promise<T> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = new URL(resource, location.href);
    if (!refreshCache && (attempt || url.searchParams.has("_resource_retry")))
      url.searchParams.set("_resource_retry", `${Date.now()}-${attempt}`);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(url, {
        cache: refreshCache ? "reload" : attempt ? "no-store" : "no-cache",
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await read(response);
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2)
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new ResourceLoadError(resource, failure);
}

export async function repairPageAssets(basePath: string) {
  interface Asset {
    path: string;
    bytes: number;
    sha256: string;
  }
  const manifest = await loadResource(
    `${basePath}assets-manifest.json`,
    async (response) => {
      const value = await response.json();
      if (
        value.version !== 1 ||
        !Array.isArray(value.files) ||
        value.files.length > 200
      )
        throw new Error("Invalid asset manifest");
      for (const asset of value.files) {
        if (
          !/^assets\/[\w.-]+\.(js|css)$/.test(asset.path) ||
          !Number.isInteger(asset.bytes) ||
          asset.bytes <= 0 ||
          asset.bytes > 16 * 1024 * 1024 ||
          !/^[a-f0-9]{64}$/.test(asset.sha256)
        )
          throw new Error("Invalid asset manifest entry");
      }
      return value.files as Asset[];
    },
    true,
  );
  let index = 0;
  const workers = Array.from(
    { length: Math.min(3, manifest.length) },
    async () => {
      while (index < manifest.length) {
        const asset = manifest[index++];
        await loadResource(
          `${basePath}${asset.path}`,
          async (response) => {
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength !== asset.bytes)
              throw new Error("Incomplete page file");
            if (globalThis.crypto?.subtle) {
              const digest = await crypto.subtle.digest("SHA-256", bytes);
              const hash = Array.from(new Uint8Array(digest), (byte) =>
                byte.toString(16).padStart(2, "0"),
              ).join("");
              if (hash !== asset.sha256)
                throw new Error("Page file checksum mismatch");
            }
          },
          true,
        );
      }
    },
  );
  const results = await Promise.allSettled(workers);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}

export async function resourceBytes(
  url: string,
  magic: string | number[],
  progress?: (value: number) => void,
) {
  return loadResource(url, async (response) => {
    const size = Number(response.headers.get("content-length"));
    let buffer: ArrayBuffer;
    if (progress && response.body) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          length += value.byteLength;
          if (Number.isFinite(size) && size > 0)
            progress(Math.min(0.99, length / size));
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      buffer = bytes.buffer;
    } else buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const header =
      typeof magic === "string"
        ? Array.from(magic, (char) => char.charCodeAt(0))
        : magic;
    if (header.some((value, index) => bytes[index] !== value))
      throw new Error("Invalid file header (possibly an HTML error page)");
    progress?.(1);
    return buffer;
  });
}

export function freshPageUrl(toOnline = false) {
  const url = new URL(location.href);
  url.searchParams.set("_reload", String(Date.now()));
  if (toOnline || /^#\/(waitroom|duel|side)(?:[/?]|$)/.test(url.hash))
    url.hash = "/match";
  return url.href;
}
