import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const WRANGLER_VERSION = "4.148.0";
const MAX_ATTEMPTS = 3;
const MAX_RETRY_SECONDS = 300;

export function wranglerInvocation(mode, npmCli = process.env.npm_execpath) {
  if (!["preview", "deploy"].includes(mode)) {
    throw new Error(
      "Use preview or deploy; the release target must be explicit.",
    );
  }
  const packageArg = `--package=wrangler@${WRANGLER_VERSION}`;
  // npm run supplies npm_execpath; invoking it through Node avoids cmd quoting.
  return npmCli
    ? {
        command: process.execPath,
        args: [npmCli, "exec", "--yes", packageArg, "--", "wrangler", mode],
        shell: false,
      }
    : {
        command: process.platform === "win32" ? "npx.cmd" : "npx",
        args: ["--yes", packageArg, "--", "wrangler", mode],
        shell: process.platform === "win32",
      };
}

export function retryDelayMs(output, attempt) {
  const text = output.replace(/\x1b\[[0-9;]*m/g, "");
  // Only a reported Cloudflare API throttle is eligible. Auth, configuration,
  // network and unknown failures must keep their original failing exit status.
  if (
    !/A request to the Cloudflare API\b/i.test(text) ||
    !/\[code:\s*(?:971|429)\]|\bHTTP(?:\s+status)?\s+429\b|\b429\s+Too Many Requests\b/i.test(
      text,
    )
  )
    return;
  const header = text.match(
    /Retry-After[^\n]*?wait\s+(\d+(?:\.\d+)?)\s+second/i,
  );
  const seconds = header ? Number(header[1]) : 30 * 2 ** (attempt - 1);
  // Never shorten a server-requested wait. If it exceeds this job's budget,
  // fail instead of retrying early. One extra second avoids rounding races.
  if (!Number.isFinite(seconds) || seconds > MAX_RETRY_SECONDS) return;
  return (Math.max(30, Math.ceil(seconds)) + 1) * 1000;
}

export async function releaseWithRetry(
  mode,
  { run, sleep = delay, log = console.log, signal } = {},
) {
  wranglerInvocation(mode); // Validate before any command is dispatched.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return 130;
    log(
      `Cloudflare ${mode}: attempt ${attempt}/${MAX_ATTEMPTS}, Wrangler ${WRANGLER_VERSION}`,
    );
    const result = await run(mode, signal);
    if (signal?.aborted) return 130;
    if (result.code === 0) return 0;
    const wait = retryDelayMs(result.output, attempt);
    if (wait === undefined || attempt === MAX_ATTEMPTS) return result.code || 1;
    log(
      `Cloudflare API throttled; waiting ${
        wait / 1000
      }s before retrying ${mode}.`,
    );
    try {
      await sleep(wait, undefined, { signal });
    } catch (error) {
      if (signal?.aborted) return 130;
      throw error;
    }
  }
  return 1;
}

function runWrangler(mode, signal) {
  const { command, args, shell } = wranglerInvocation(mode);
  return new Promise((resolveResult) => {
    let output = "";
    const child = spawn(command, args, {
      shell,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      windowsHide: true,
    });
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    for (const [source, target] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      source.on("data", (chunk) => {
        // Retain a bounded tail for classification; credentials are never read.
        output = (output + chunk.toString()).slice(-65536);
        target.write(chunk);
      });
    }
    child.once("error", () => {
      signal?.removeEventListener("abort", abort);
      console.error("Could not start the pinned Wrangler command.");
      resolveResult({ code: 1, output: "" });
    });
    child.once("close", (code, childSignal) => {
      signal?.removeEventListener("abort", abort);
      resolveResult({ code: code ?? 1, output: childSignal ? "" : output });
    });
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const cancellation = new AbortController();
  process.once("SIGINT", () => cancellation.abort());
  process.once("SIGTERM", () => cancellation.abort());
  try {
    if (process.argv.length !== 3)
      throw new Error(
        "Usage: node scripts/release_cloudflare.mjs preview|deploy",
      );
    process.exitCode = await releaseWithRetry(process.argv[2], {
      run: runWrangler,
      signal: cancellation.signal,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
