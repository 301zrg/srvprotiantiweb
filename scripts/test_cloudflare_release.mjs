import assert from "node:assert/strict";
import {
  releaseWithRetry,
  retryDelayMs,
  wranglerInvocation,
  WRANGLER_VERSION,
} from "./release_cloudflare.mjs";

const limited = `
✘ [ERROR] A request to the Cloudflare API (/accounts/test/workers/workers/test/previews/test) failed.
  Please wait and consider throttling your request speed [code: 971]
  The API responded with a "Retry-After" header indicating you should wait 30 second(s) before retrying.
`;
assert.equal(retryDelayMs(limited, 1), 31000);
assert.equal(retryDelayMs(limited.replace("30 second", "60 second"), 1), 61000);
assert.equal(
  retryDelayMs(limited.replace("30 second", "300 second"), 1),
  301000,
);
assert.equal(
  retryDelayMs(limited.replace("30 second", "301 second"), 1),
  undefined,
);
assert.equal(retryDelayMs(limited.replace("30 second", "0 second"), 1), 31000);
assert.equal(retryDelayMs(limited.replace(/.*Retry-After.*\n/, ""), 2), 61000);
assert.equal(
  retryDelayMs(limited.replace("code: 971", "code: 10000"), 1),
  undefined,
);
assert.equal(retryDelayMs("Authentication error [code: 971]", 1), undefined);
assert.equal(retryDelayMs("Missing previews block", 1), undefined);
assert.equal(retryDelayMs("Network connection failed", 1), undefined);
assert.equal(retryDelayMs(limited.replace("code: 971", "code: 429"), 1), 31000);

for (const mode of ["preview", "deploy"]) {
  const command = wranglerInvocation(mode, "C:/Program Files/node/npm-cli.js");
  assert.equal(command.shell, false);
  assert.equal(command.args.at(-1), mode);
  assert.ok(command.args.includes(`--package=wrangler@${WRANGLER_VERSION}`));
  assert.equal(command.args[0], "C:/Program Files/node/npm-cli.js");
  const calls = [],
    waits = [];
  const result = await releaseWithRetry(mode, {
    run: async (target) => {
      calls.push(target);
      return calls.length === 1
        ? { code: 1, output: limited }
        : { code: 0, output: "Success" };
    },
    sleep: async (ms) => waits.push(ms),
    log: () => {},
  });
  assert.equal(result, 0);
  assert.deepEqual(calls, [mode, mode]); // Never promotes preview to production.
  assert.deepEqual(waits, [31000]);
}
for (const output of [
  "Authentication error [code: 10000]",
  "Missing previews block",
  "Fetch failed",
]) {
  let attempts = 0;
  assert.equal(
    await releaseWithRetry("preview", {
      run: async () => {
        attempts++;
        return { code: 7, output };
      },
      sleep: async () => {
        throw new Error("Unexpected retry");
      },
      log: () => {},
    }),
    7,
  );
  assert.equal(attempts, 1);
}
let attempts = 0;
const waits = [];
assert.equal(
  await releaseWithRetry("preview", {
    run: async () => {
      attempts++;
      return { code: 9, output: limited };
    },
    sleep: async (ms) => waits.push(ms),
    log: () => {},
  }),
  9,
);
assert.equal(attempts, 3);
assert.deepEqual(waits, [31000, 31000]);

const cancellation = new AbortController();
attempts = 0;
assert.equal(
  await releaseWithRetry("preview", {
    run: async () => {
      attempts++;
      return { code: 1, output: limited };
    },
    sleep: async () => cancellation.abort(),
    signal: cancellation.signal,
    log: () => {},
  }),
  130,
);
assert.equal(attempts, 1);
await assert.rejects(
  releaseWithRetry("unknown", {
    run: async () => assert.fail("Invalid target dispatched"),
  }),
);
console.log(
  "Cloudflare release: pinned version, Retry-After, bounded retries, fail-closed errors, cancellation and preview isolation passed.",
);
