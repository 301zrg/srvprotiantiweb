import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("dist");
const basePath = `/${(process.env.STATIC_BASE_PATH || "/").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".wasm": "application/wasm", ".cdb": "application/octet-stream",
  ".conf": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (!path.startsWith(basePath)) {
    response.writeHead(404).end();
    return;
  }
  const relative = path.slice(basePath.length);
  const target = resolve(root, relative || "index.html");
  if (target !== root && !target.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(target);
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${process.env.PORT || 4173}${basePath}`);
});
