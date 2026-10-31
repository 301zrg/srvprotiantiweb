import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Practice resources must resolve like replay playback (src/ui/Replay/index.tsx):
// against document.baseURI, so root, absolute-subpath and relative-path builds all work.
const source = readFileSync(new URL("../src/ui/Practice/usePracticeSession.ts", import.meta.url), "utf8");
const base = /base: new URL\(\s*`\$\{import\.meta\.env\.BASE_URL\}replay\/\$\{practiceProfile\.revision\}\/`,\s*(?:\/\/[^\n]*\n\s*)?([\w.]+),/.exec(source);
assert.ok(base, "practice worker base URL construction was not found");
assert.equal(base[1], "document.baseURI", "practice resources must resolve against document.baseURI");

const resolve = (baseUrl, page) => new URL(`${baseUrl}replay/1103-201103-v1/`, page).href;
assert.equal(resolve("/", "https://example.test/practice"), "https://example.test/replay/1103-201103-v1/");
assert.equal(resolve("/client/", "https://example.test/client/practice"), "https://example.test/client/replay/1103-201103-v1/");
assert.equal(resolve("./", "https://example.test/bundle/v2/index.html"), "https://example.test/bundle/v2/replay/1103-201103-v1/");
// The previous origin-based form sent a relative build to the site root.
assert.equal(new URL("./replay/1103-201103-v1/", "https://example.test").href, "https://example.test/replay/1103-201103-v1/");
console.log("practice base URL tests passed");
