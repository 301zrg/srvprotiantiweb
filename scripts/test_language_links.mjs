import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readLanguageLink, updateLanguageLink } from "../src/variant/languageLink.ts";

for (const [parameter, selected] of [["zh", "cn"], ["cn", "cn"], ["zh-CN", "cn"], ["en", "en"], ["en-US", "en"], ["ja", "ja"], ["ja-JP", "ja"], ["ko", "ko"], ["ko-KR", "ko"]]) {
  assert.equal(readLanguageLink(new URL(`https://example.test/client/?lang=${parameter}#/match`)), selected);
  assert.equal(readLanguageLink(new URL(`https://example.test/client/#/import?data=fixture&lang=${parameter}`)), selected);
}
assert.equal(readLanguageLink(new URL("https://example.test/?lang=en#/replay-import?lang=ko")), "ko");
assert.equal(readLanguageLink(new URL("https://example.test/?lang=ja#/match?lang=unknown")), "ja");
assert.equal(readLanguageLink(new URL("https://example.test/?lang=fr#/match?lang=unknown")), undefined);
const original = new URL("https://example.test/nested/index.html?lang=en&other=42#/match?room=A%26B&spectate=1&lang=ko");
const updated = updateLanguageLink(original, "cn");
assert.equal(original.searchParams.get("lang"), "en");
assert.equal(updated.searchParams.get("lang"), "zh");
assert.equal(updated.searchParams.get("other"), "42");
assert.equal(updated.pathname, original.pathname);
assert.equal(new URLSearchParams(updated.hash.split("?")[1]).get("room"), "A&B");
assert.equal(readLanguageLink(updated), "cn");
assert.equal(updateLanguageLink(new URL("https://example.test/#/build"), "ja").href, "https://example.test/#/build");

const catalogs = ["Chinese", "English", "Japanese", "Korean"].map(name => JSON.parse(readFileSync(`src/ui/I18N/Source/${name}/translation.json`, "utf8")));
for (const namespace of Object.keys(catalogs[0])) {
  const expected = [...new Set(catalogs.flatMap(c => Object.keys(c[namespace] ?? {})))].sort();
  for (const catalog of catalogs) {
    assert.deepEqual(Object.keys(catalog[namespace]).sort(), expected, namespace);
    for (const [key, value] of Object.entries(catalog[namespace])) {
      assert.ok(typeof value === "string" && value.length > 0, namespace + ":" + key);
      const placeholders = [...value.matchAll(/{{(.*?)}}/g)].map(m => m[1]).sort();
      assert.deepEqual(placeholders, [...catalogs[0][namespace][key].matchAll(/{{(.*?)}}/g)].map(m => m[1]).sort(), namespace + ":" + key);
    }
  }
}
console.log("Language links and complete four-language catalogs passed: URL precedence, aliases, invalid fallback, safe manual switch and matching interpolation fields.");
