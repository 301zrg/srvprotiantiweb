import assert from "node:assert/strict";
import { test } from "node:test";
import {
  base64urlDecode,
  base64urlEncode,
  createDeckImportUrl,
  DeckImportError,
  inputFromEncoded,
  parseDeckInput,
  validateDeckLists,
} from "../src/variant/deckImport.ts";

const deck = {
  main: [89631139, 89631139],
  extra: [44508094],
  side: [44508094, 89631139],
};
const ydk =
  "\uFEFF#created by fixture\r\n#main\r\n89631139\r\n89631139\r\n#extra\r\n44508094\r\n!side\r\n44508094\r\n89631139\r\n";
// Construct the protocol fixture independently from the production decoder.
const raw = new Uint8Array(28);
const view = new DataView(raw.buffer);
[3, 2, 89631139, 89631139, 44508094, 44508094, 89631139].forEach((n, i) =>
  view.setUint32(i * 4, n, true),
);
const classify = (id) =>
  id === 44508094 ? "extra" : id === 89631139 ? "main" : undefined;
const error = (code) => (e) => e instanceof DeckImportError && e.code === code;

test("YDK, split JSON and binary payload preserve zones, order and duplicates", () => {
  assert.deepEqual(parseDeckInput({ format: "ydk", text: ydk }), deck);
  assert.deepEqual(validateDeckLists(deck), deck);
  assert.deepEqual(
    parseDeckInput({ format: "ygopro-update-deck", bytes: raw }, classify),
    deck,
  );
  const padded = new Uint8Array(30);
  padded.set(raw, 1);
  assert.deepEqual(
    parseDeckInput(
      { format: "ygopro-update-deck", bytes: padded.subarray(1, 29) },
      classify,
    ),
    deck,
  );
});

test("an unknown combined-zone ID requires review; unknown side IDs retain Side", () => {
  const bytes = raw.slice();
  new DataView(bytes.buffer).setUint32(16, 123456789, true);
  assert.throws(
    () => parseDeckInput({ format: "ygopro-update-deck", bytes }, classify),
    (e) =>
      error("unknown-zones")(e) &&
      assert.deepEqual(e.cardIds, [123456789]) === undefined,
  );
  new DataView(bytes.buffer).setUint32(16, 44508094, true);
  new DataView(bytes.buffer).setUint32(20, 123456789, true);
  assert.deepEqual(
    parseDeckInput({ format: "ygopro-update-deck", bytes }, classify).side,
    [123456789, 89631139],
  );
});

test("malformed YDK is rejected instead of silently dropping cards", () => {
  for (const text of [
    "89631139",
    "#main\n89631139\n#main\n44508094",
    "#main\n89631139\nbroken",
    "#main\nconstructor\n89631139",
    "#main\n-1",
    "#main\n1.5",
  ])
    assert.throws(
      () => parseDeckInput({ format: "ydk", text }),
      error("invalid-format"),
    );
  for (const id of [0, 4294967296, Infinity, -1, "89631139", null])
    assert.throws(
      () => validateDeckLists({ main: [id], extra: [], side: [] }),
      error("invalid-card"),
    );
  assert.throws(
    () => validateDeckLists({ main: [], extra: [], side: [] }),
    error("empty-deck"),
  );
  assert.throws(
    () => validateDeckLists({ main: [89631139], side: [] }),
    error("invalid-format"),
  );
});

test("buffer limits and exact size reject truncated, appended and hostile counts", () => {
  for (const bytes of [
    raw.slice(0, 7),
    raw.slice(0, -1),
    new Uint8Array([...raw, 0]),
  ])
    assert.throws(
      () => parseDeckInput({ format: "ygopro-update-deck", bytes }, classify),
      error("invalid-format"),
    );
  const counts = raw.slice();
  new DataView(counts.buffer).setUint32(0, 0xffffffff, true);
  assert.throws(
    () =>
      parseDeckInput({ format: "ygopro-update-deck", bytes: counts }, classify),
    error("too-large"),
  );
  assert.throws(
    () =>
      validateDeckLists({
        main: Array(301).fill(89631139),
        extra: [],
        side: [],
      }),
    error("too-large"),
  );
  assert.throws(
    () =>
      parseDeckInput({ format: "ydk", text: "#main\n" + "#".repeat(65536) }),
    error("too-large"),
  );
});

test("Base64url and UTF-8 validation fail closed without exposing received content", () => {
  assert.deepEqual(base64urlDecode(base64urlEncode(raw)), raw);
  for (const data of ["A", "Zg=", "Zh", "//8", "a b", "%%", ""])
    assert.throws(() => base64urlDecode(data), error("invalid-format"));
  assert.throws(
    () =>
      inputFromEncoded(
        "ydk-utf8-base64url",
        base64urlEncode(new Uint8Array([255])),
      ),
    error("invalid-format"),
  );
  assert.throws(
    () =>
      inputFromEncoded(
        "deck-json-base64url",
        base64urlEncode(new TextEncoder().encode("{bad")),
      ),
    error("invalid-format"),
  );
});

test("public import links round-trip all formats while retaining Toy subpaths", () => {
  for (const input of [
    { format: "ydk", text: ydk },
    { format: "ygopro-update-deck", bytes: raw },
    { format: "deck-json", deck },
  ]) {
    const url = new URL(
      createDeckImportUrl(
        "https://example.invalid/toy/square/demo-v2/index.html",
        input,
        "公开卡组.ydk",
      ),
    );
    assert.equal(url.pathname, "/toy/square/demo-v2/index.html");
    const params = new URLSearchParams(url.hash.split("?")[1]);
    assert.equal(params.get("title"), "公开卡组");
    assert.deepEqual(
      parseDeckInput(
        inputFromEncoded(params.get("format"), params.get("data")),
        classify,
      ),
      deck,
    );
  }
  assert.throws(
    () =>
      createDeckImportUrl("https://example.invalid", {
        format: "ydk",
        text: "#main\n" + "#".repeat(4096),
      }),
    error("too-large"),
  );
});
