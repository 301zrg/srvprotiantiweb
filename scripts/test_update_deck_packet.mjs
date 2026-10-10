import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const directory = resolve(".audit-tmp/update-deck-packet");
mkdirSync(directory, { recursive: true });
const compiled = await build({
  entryPoints: ["src/api/ocgcore/ocgAdapter/ctos/ctosUpdateDeck.ts"],
  bundle: true, write: false, format: "esm", platform: "node",
  tsconfig: "tsconfig.json",
});
const out = resolve(directory, "adapter.mjs");
writeFileSync(out, compiled.outputFiles[0].text);
const { default: Adapter } = await import(pathToFileURL(out));

// Synthetic decks; none of the player's supplied YDK files are fixtures.
for (const deck of [
  { main: [], extra: [], side: [] },
  { main: [6276588, 6276588, 3846170], extra: [89112729, 54541900], side: [42425831, 42425831] },
  { main: [0xffffffff, 1, 0x80000000], extra: [], side: [1] },
  { main: Array(60).fill(6276588), extra: Array(15).fill(89112729), side: Array(15).fill(3846170) },
]) {
  // Native SendUpdateDeck writes these uint32s, then SendBufferToServer
  // prefixes uint16(1 + body size) and uint8(CTOS_UPDATE_DECK).
  const values = [deck.main.length + deck.extra.length, deck.side.length,
    ...deck.main, ...deck.extra, ...deck.side];
  const native = Buffer.alloc(3 + values.length * 4);
  native.writeUInt16LE(native.length - 2);
  native[2] = 2;
  values.forEach((value, index) => native.writeUInt32LE(value, 3 + index * 4));
  const web = Buffer.from(new Adapter({ ctos_update_deck: deck }).serialize());
  assert.deepEqual(web, native, "Native reconnect compares the entire packet body, including any surplus bytes");
  assert.equal(web.readUInt16LE(0) + 2, web.length);
  assert.equal(web.length, 11 + 4 * (deck.main.length + deck.extra.length + deck.side.length));
}
console.log("PASS 4 UPDATE_DECK native-format cases: exact lengths, order, duplicates, all regions and uint32 IDs");
