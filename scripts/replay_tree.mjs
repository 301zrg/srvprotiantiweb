// Effective Lua tree and digest, identical to the server release tool
// (script-versioning-20261109/tools/lua-tree.cjs; plan 02 §3.3).
// Lookup order: specials/ -> expansions/script/ -> script/. Digest: every
// effective .lua, "\r\n" -> "\n" (a lone "\r" stays), SHA-256 per file,
// lines "name\tsha\n" sorted by name, SHA-256 over all lines.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const LAYERS = ["specials", "expansions/script", "script"];
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const lf = (bytes) =>
  Buffer.from(Buffer.from(bytes).toString("latin1").replace(/\r\n/g, "\n"), "latin1");

export function readLayer(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.isDirectory())
      throw new Error(`unexpected entry in layer: ${path.join(dir, entry.name)}`);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".lua"))
      out.set(entry.name, fs.readFileSync(path.join(dir, entry.name)));
  }
  return out;
}

export function readLayers(root) {
  return Object.fromEntries(LAYERS.map((l) => [l, readLayer(path.join(root, ...l.split("/")))]));
}

export function effective(layers) {
  const seen = new Map();
  for (const l of LAYERS)
    for (const [name, bytes] of layers[l] || [])
      if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), { name, layer: l, bytes });
  return [...seen.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function digest(tree) {
  return sha256(Buffer.from(tree.map((f) => `${f.name}\t${sha256(lf(f.bytes))}\n`).join(""), "utf8"));
}

/** Packs [{name, bytes}] exactly like scripts.data: uint32 index length + JSON index + bytes. */
export function pack(files, extra = {}) {
  const index = [];
  let offset = 0;
  for (const f of files) {
    index.push({ name: f.name, offset, bytes: f.bytes.length, sha256: sha256(f.bytes) });
    offset += f.bytes.length;
  }
  const json = Buffer.from(JSON.stringify(Object.keys(extra).length ? { ...extra, set: index } : index));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(json.length);
  return Buffer.concat([head, json, ...files.map((f) => f.bytes)]);
}

/** Reads scripts.data (already gunzipped) into Map(name -> Buffer). */
export function unpack(raw) {
  const n = raw.readUInt32LE(0);
  const index = JSON.parse(raw.subarray(4, 4 + n).toString("utf8"));
  const base = 4 + n;
  return new Map(index.map((e) => [e.name, raw.subarray(base + e.offset, base + e.offset + e.bytes)]));
}
