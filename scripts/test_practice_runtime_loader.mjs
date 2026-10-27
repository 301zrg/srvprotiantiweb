import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "vite";
assert.ok(
  existsSync("src/replay/runtime.ts"),
  "A shared verified runtime loader must exist without a duel",
);
const vite = await createServer({
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { disabled: true },
  logLevel: "error",
});
try {
  const { loadReplayResource } = await vite.ssrLoadModule(
    "/src/replay/runtime.ts",
  );
  const profile = JSON.parse(readFileSync("src/replay/profile.json", "utf8"));
  const fetchBefore = globalThis.fetch;
  let requested = [];
  globalThis.fetch = async (url) => {
    const name = new URL(url).pathname.split("/").pop();
    requested.push(name);
    return new Response(readFileSync("public/replay/706-v1/" + name));
  };
  try {
    const bytes = await loadReplayResource(
      "https://fixture.invalid/",
      profile,
      "ocgcore.wasm",
      () => {},
    );
    assert.equal(bytes.length, profile.files["ocgcore.wasm"].bytes);
    assert.deepEqual(requested, ["ocgcore.wasm"]);
    await assert.rejects(
      loadReplayResource(
        "https://fixture.invalid/",
        {
          ...profile,
          files: {
            ...profile.files,
            "ocgcore.wasm": { ...profile.files["ocgcore.wasm"], sha256: "bad" },
          },
        },
        "ocgcore.wasm",
        () => {},
      ),
      /校验/,
    );
    await assert.rejects(
      loadReplayResource(
        "https://fixture.invalid/",
        profile,
        "arbitrary.lua",
        () => {},
      ),
      /清单/,
    );
  } finally {
    globalThis.fetch = fetchBefore;
  }
  console.log("verified runtime resource loader: PASS");
} finally {
  await vite.close();
}
