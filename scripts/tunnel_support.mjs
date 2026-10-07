import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const nginxExecutable = process.env.NGINX_EXECUTABLE || join(root, ".audit-tmp/tools/nginx-1.30.5/nginx.exe");
const cloudflaredExecutable = process.env.CLOUDFLARED_EXECUTABLE || join(root, ".audit-tmp/tools/cloudflared.exe");

export async function waitForTcp(port, child, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) throw new Error(`Child exited with code ${child.exitCode}`);
    const connected = await new Promise((done) => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.setTimeout(500);
      socket.once("connect", () => { socket.destroy(); done(true); });
      socket.once("error", () => { socket.destroy(); done(false); });
      socket.once("timeout", () => { socket.destroy(); done(false); });
    });
    if (connected) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`Local TCP ${port} did not start`);
}

export async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" });
  } else child.kill("SIGTERM");
  await Promise.race([
    new Promise((done) => child.once("exit", done)),
    new Promise((done) => setTimeout(done, 3000)),
  ]);
}

export async function startNginxGateway({ runtime, upstreamPort, gatewayPort }) {
  if (!existsSync(nginxExecutable)) throw new Error(`Set NGINX_EXECUTABLE; missing ${nginxExecutable}`);
  const prefix = join(runtime, "nginx");
  mkdirSync(join(prefix, "logs"), { recursive: true });
  mkdirSync(join(prefix, "temp"), { recursive: true });
  const gateway = readFileSync(join(root, "deployment/windows/neos-tunnel.conf"), "utf8")
    .replaceAll("127.0.0.1:7977", `127.0.0.1:${upstreamPort}`)
    .replaceAll("127.0.0.1:7978", `127.0.0.1:${gatewayPort}`);
  writeFileSync(join(prefix, "nginx.conf"),
    "daemon off;\nmaster_process off;\npid logs/nginx.pid;\nerror_log logs/error.log;\nevents { worker_connections 256; }\nhttp {\n" + gateway + "\n}\n");
  const args = ["-p", prefix.replaceAll("\\", "/") + "/", "-c", "nginx.conf"];
  const checked = spawnSync(nginxExecutable, [...args, "-t"], { windowsHide: true, encoding: "utf8" });
  if (checked.error) throw checked.error;
  if (checked.status !== 0) throw new Error(`nginx -t failed: ${checked.stderr}`);
  const child = spawn(nginxExecutable, args, { cwd: prefix, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", () => {});
  child.stdout.resume();
  child.stderr.resume();
  try { await waitForTcp(gatewayPort, child); }
  catch (error) { await stopChild(child); throw error; }
  return child;
}

export async function startQuickTunnel({ runtime, gatewayPort }) {
  if (!existsSync(cloudflaredExecutable)) throw new Error(`Set CLOUDFLARED_EXECUTABLE; missing ${cloudflaredExecutable}`);
  const config = join(runtime, "quick-tunnel.yml");
  const protocol = process.env.CLOUDFLARED_PROTOCOL || "auto";
  if (!["auto", "http2", "quic"].includes(protocol)) throw new Error("Invalid CLOUDFLARED_PROTOCOL");
  writeFileSync(config, `protocol: ${protocol}\n`);
  // Optional per-process diagnostic override for a local proxy's fake DNS.
  // Never pin these addresses in production: resolve current official edge DNS.
  const edgeArgs = (process.env.CLOUDFLARED_EDGE_ADDRESSES || "")
    .split(",").filter(Boolean).flatMap((address) => ["--edge", address]);
  const child = spawn(cloudflaredExecutable, [
    "tunnel", "--config", config, "--no-autoupdate", "--protocol", protocol,
    "--url", `http://127.0.0.1:${gatewayPort}`, "--metrics", "127.0.0.1:0",
    ...edgeArgs,
  ], { cwd: runtime, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const record = (chunk) => {
    output = (output + chunk).slice(-24000);
    writeFileSync(join(runtime, "quick-tunnel.log"), output);
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.on("error", (error) => record(error.message));
  const deadline = Date.now() + 90000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode != null) throw new Error(`cloudflared exited: ${output.slice(-3500)}`);
      const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && output.includes("Registered tunnel connection")) {
        return { child, url: match[0].replace("https://", "wss://") + "/neos" };
      }
      await new Promise((done) => setTimeout(done, 300));
    }
    throw new Error(`Tunnel timed out: ${output.slice(-3500)}`);
  } catch (error) { await stopChild(child); throw error; }
}
