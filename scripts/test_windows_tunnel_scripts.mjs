import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Windows PowerShell launcher regression requires Windows.");
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const audit = join(root, ".audit-tmp");
mkdirSync(audit, { recursive: true });
const officialBinary = join(audit, "tools/cloudflared.exe");
assert.ok(existsSync(officialBinary), "Place the verified official connector in .audit-tmp/tools/cloudflared.exe first.");
const runtime = mkdtempSync(join(audit, "windows scripts-"));
const unrelated = join(runtime, "unrelated working directory");
mkdirSync(unrelated);
const scripts = join(root, "deployment/windows");
const execute = (args, cwd = unrelated) => spawnSync("powershell.exe", ["-NoProfile", ...args], {
  cwd, windowsHide: true, encoding: "utf8", timeout: 30000,
});
const completed = (result) => {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
};
const probe = net.createServer((socket) => socket.end());

try {
  const downloader = join(runtime, "verified connector");
  mkdirSync(downloader);
  copyFileSync(join(scripts, "Download-Cloudflared.ps1"), join(downloader, "Download-Cloudflared.ps1"));
  copyFileSync(officialBinary, join(downloader, "cloudflared.exe"));
  // Actual -File invocation with no path parameter, from another directory.
  const defaultDownload = execute(["-File", join(downloader, "Download-Cloudflared.ps1")]);
  completed(defaultDownload);
  assert.match(defaultDownload.stdout, /cloudflared version 2026\.10\.0/);
  completed(execute(["-File", join(downloader, "Download-Cloudflared.ps1"), "-Destination", officialBinary]));

  const mismatched = join(runtime, "existing other connector.exe");
  writeFileSync(mismatched, "Do not overwrite this unrelated file.");
  const rejected = execute(["-File", join(downloader, "Download-Cloudflared.ps1"), "-Destination", mismatched]);
  assert.ifError(rejected.error);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /differs from the pinned release/);
  assert.equal(readFileSync(mismatched, "utf8"), "Do not overwrite this unrelated file.");

  const launcher = join(runtime, "tunnel launcher");
  mkdirSync(launcher);
  copyFileSync(join(scripts, "Start-NeosQuickTunnel.ps1"), join(launcher, "Start-NeosQuickTunnel.ps1"));
  const compiler = join(runtime, "compile-fixture.ps1");
  // An offline fixture checks the real PowerShell process launch and argument quoting.
  // It registers no Cloudflare tunnel and exits by itself after writing fixture logs.
  writeFileSync(compiler, `param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$definition = @'
using System;
using System.IO;
using System.Threading;
public class OfflineTunnelFixture {
  public static int Main(string[] args) {
    int config = Array.IndexOf(args, "--config");
    int url = Array.IndexOf(args, "--url");
    if (config < 0 || config + 1 >= args.Length || !File.Exists(args[config + 1])) return 11;
    if (url < 0 || url + 1 >= args.Length || !args[url + 1].StartsWith("http://127.0.0.1:")) return 12;
    if (Path.GetFullPath(args[config + 1]) != Path.Combine(Directory.GetCurrentDirectory(), "quick-tunnel.yml")) return 13;
    Console.Error.WriteLine("https://offline-regression-only.trycloudflare.com");
    Console.Error.WriteLine("Registered tunnel connection");
    Thread.Sleep(2500);
    return 0;
  }
}
'@
Add-Type -TypeDefinition $definition -OutputAssembly $OutputPath -OutputType ConsoleApplication
`);
  const fixture = join(launcher, "cloudflared.exe");
  completed(execute(["-File", compiler, "-OutputPath", fixture]));
  await new Promise((done, fail) => {
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", done);
  });
  const port = probe.address().port;
  for (const extra of [[], ["-CloudflaredPath", fixture]]) {
    const result = await new Promise((done, fail) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-File", join(launcher, "Start-NeosQuickTunnel.ps1"), "-GatewayPort", String(port), ...extra], {
        cwd: unrelated, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      child.once("error", fail);
      child.once("close", (status) => done({ status, stdout, stderr }));
    });
    assert.match(result.stdout, /Neos test endpoint: wss:\/\/offline-regression-only\.trycloudflare\.com\/neos/, result.stdout + result.stderr);
    // The fixture exits intentionally, so the launcher reports that it stopped.
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tunnel stopped unexpectedly/);
    const logs = result.stdout.match(/Logs: (.+)/)[1].trim();
    assert.equal(dirname(dirname(logs)), launcher);
    assert.equal(readFileSync(join(logs, "endpoint.txt"), "utf8").trim(), "wss://offline-regression-only.trycloudflare.com/neos");
  }
  console.log("Windows PowerShell 5.1 script regression passed: -File default/explicit paths, spaces, unrelated cwd, official SHA validation, offline launcher/logs.");
} finally {
  if (probe.listening) await new Promise((done) => probe.close(done));
  const checked = realpathSync(runtime);
  assert.ok(checked.startsWith(realpathSync(audit) + sep), "Cleanup must remain inside this test's workspace audit directory.");
  rmSync(checked, { recursive: true, force: true });
}
