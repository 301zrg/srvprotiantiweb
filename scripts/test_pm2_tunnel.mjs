import assert from 'node:assert/strict';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { endpointFromLog, readSettings } = require('../deployment/windows/neos-quick-tunnel.cjs');
assert.equal(readSettings({}, root).port, 7978);
assert.equal(readSettings({}, root).protocol, 'auto');
for (const port of ['0', '65536', '7911garbage', '-1', '1.5']) {
  assert.throws(() => readSettings({ NEOS_GATEWAY_PORT: port }, root), /NEOS_GATEWAY_PORT/);
}
assert.throws(() => readSettings({ NEOS_TUNNEL_PROTOCOL: 'insecure' }, root), /NEOS_TUNNEL_PROTOCOL/);
assert.throws(() => readSettings({ NEOS_TUNNEL_START_TIMEOUT_MS: '249' }, root), /NEOS_TUNNEL_START_TIMEOUT_MS/);
assert.equal(endpointFromLog('| https://offline-test.trycloudflare.com |'), 'wss://offline-test.trycloudflare.com/neos');
assert.equal(endpointFromLog('https://offline-test.trycloudflare.com.evil.invalid/'), null);
assert.equal(endpointFromLog('https://another.example.com/'), null);

if (process.platform !== 'win32') {
  console.log('Tunnel settings/parser passed. Windows PM2 lifecycle regression requires Windows.');
  process.exit(0);
}
const pm2Binary = process.env.PM2_TEST_BIN || join(root, '.audit-tmp/pm2-tool/node_modules/pm2/bin/pm2');
assert.ok(existsSync(pm2Binary), 'Install PM2 in .audit-tmp/pm2-tool or set PM2_TEST_BIN to its bin/pm2 script.');
const audit = join(root, '.audit-tmp');
mkdirSync(audit, { recursive: true });
const runtime = mkdtempSync(join(audit, 'pm2 tunnel regression-'));
const directory = join(runtime, 'server kit with spaces');
const unrelatedDirectory = join(runtime, 'unrelated cwd');
mkdirSync(directory);
mkdirSync(unrelatedDirectory);
for (const name of ['neos-quick-tunnel.cjs', 'ecosystem.neos.config.js']) {
  copyFileSync(join(root, 'deployment/windows', name), join(directory, name));
}
const application = join(directory, 'neos-quick-tunnel.cjs');
const ecosystem = join(directory, 'ecosystem.neos.config.js');
const fixture = join(directory, 'cloudflared.exe');
const children = new Set();
const gateway = net.createServer((socket) => socket.end());
let pm2Used = false;
const pm2Environment = { ...process.env, PM2_HOME: join(runtime, 'isolated-pm2-home') };

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
async function waitFor(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = check(); if (result) return result; }
    catch (error) { lastError = error; }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`${message}${lastError ? ': ' + lastError.message : ''}`);
}
function launch(environment) {
  const child = spawn(process.execPath, [application], {
    cwd: unrelatedDirectory, windowsHide: true,
    env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  children.add(child);
  const result = { child, stdout: '', stderr: '', messages: [] };
  child.stdout.setEncoding('utf8').on('data', (chunk) => { result.stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { result.stderr += chunk; });
  child.on('message', (message) => result.messages.push(message));
  result.closed = new Promise((done, fail) => {
    child.once('error', fail);
    child.once('close', (code) => { children.delete(child); done(code); });
  });
  return result;
}
async function closed(result, timeout = 12000) {
  let timer;
  try {
    return await Promise.race([result.closed, new Promise((_, fail) => {
      timer = setTimeout(() => fail(new Error(`Wrapper did not exit: ${result.stdout}\n${result.stderr}`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
async function pm2(...args) {
  // This CLI exits while its isolated daemon/app remain running, just as when
  // the operator closes the PowerShell window after `pm2 start` completes.
  return new Promise((done, fail) => {
    execFile(process.execPath, [pm2Binary, ...args], {
      cwd: unrelatedDirectory, windowsHide: true, env: pm2Environment,
      timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8',
    }, (error, stdout, stderr) => {
      if (error) fail(new Error(`Isolated PM2 ${args[0]} failed: ${stderr || error.message}`));
      else done(stdout);
    });
  });
}
const status = (folder) => JSON.parse(readFileSync(join(folder, 'status.json'), 'utf8'));
const ready = (folder) => waitFor(() => {
  const value = status(folder);
  return value.state === 'ready' ? value : false;
}, 'Tunnel did not become ready');
function noEndpoint(folder) {
  assert.ok(!existsSync(join(folder, 'endpoint.txt')));
  assert.ok(!existsSync(join(folder, 'duel-config.js')));
}

try {
  const compiler = join(runtime, 'compile-fixture.ps1');
  writeFileSync(compiler, `param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public class OfflinePm2TunnelFixture {
  public static int Main(string[] args) {
    int config = Array.IndexOf(args, "--config");
    int metrics = Array.IndexOf(args, "--metrics");
    int url = Array.IndexOf(args, "--url");
    if (config < 0 || config + 1 >= args.Length || !File.Exists(args[config + 1])) return 11;
    if (url < 0 || url + 1 >= args.Length || !args[url + 1].StartsWith("http://127.0.0.1:")) return 12;
    if (metrics < 0 || metrics + 1 >= args.Length || args[metrics + 1] != "127.0.0.1:0") return 13;
    if (Path.GetFullPath(args[config + 1]) != Path.Combine(Directory.GetCurrentDirectory(), "quick-tunnel.yml")) return 14;
    int pid = Process.GetCurrentProcess().Id;
    File.WriteAllText(Path.Combine(Directory.GetCurrentDirectory(), "fixture.pid"), pid.ToString());
    string mode = Environment.GetEnvironmentVariable("FIXTURE_MODE");
    if (mode == "silent") { Thread.Sleep(60000); return 0; }
    string marker = Environment.GetEnvironmentVariable("FIXTURE_CRASH_ONCE_MARKER");
    bool crash = mode == "crash" || (!String.IsNullOrEmpty(marker) && !File.Exists(marker));
    if (!String.IsNullOrEmpty(marker)) File.WriteAllText(marker, "crash-once");
    // Exercise reversed registration order and a URL split over two chunks.
    Console.Error.WriteLine("Registered tunnel connection");
    Console.Error.Write("https://offline-pm2-");
    Console.Error.Flush();
    Thread.Sleep(100);
    Console.Error.WriteLine(pid.ToString() + ".trycloudflare.com");
    if (crash) { Thread.Sleep(1600); return 7; }
    Thread.Sleep(600000);
    return 0;
  }
}
'@
Add-Type -TypeDefinition $source -OutputAssembly $OutputPath -OutputType ConsoleApplication
`);
  const compiled = spawnSync('powershell.exe', ['-NoProfile', '-File', compiler, '-OutputPath', fixture], {
    cwd: unrelatedDirectory, windowsHide: true, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(compiled.error);
  assert.equal(compiled.status, 0, compiled.stdout + compiled.stderr);
  await new Promise((done, fail) => {
    gateway.once('error', fail);
    gateway.listen(0, '127.0.0.1', done);
  });
  const common = {
    NEOS_CLOUDFLARED_PATH: fixture, NEOS_GATEWAY_PORT: String(gateway.address().port),
    NEOS_TUNNEL_GATEWAY_WAIT_MS: '800', NEOS_TUNNEL_START_TIMEOUT_MS: '1200',
  };

  // Failed origin probing must never launch cloudflared or publish old state.
  const unavailable = net.createServer();
  await new Promise((done) => unavailable.listen(0, '127.0.0.1', done));
  const unavailablePort = unavailable.address().port;
  await new Promise((done) => unavailable.close(done));
  const downRuntime = join(runtime, 'gateway-down');
  const down = launch({ ...common, NEOS_GATEWAY_PORT: String(unavailablePort), NEOS_TUNNEL_RUNTIME_DIR: downRuntime });
  assert.equal(await closed(down), 1);
  assert.match(down.stderr, /Nginx gateway .* did not start/);
  assert.ok(!existsSync(join(downRuntime, 'fixture.pid')));
  noEndpoint(downRuntime);

  const silentRuntime = join(runtime, 'registration-timeout');
  const silent = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: silentRuntime, FIXTURE_MODE: 'silent' });
  await waitFor(() => existsSync(join(silentRuntime, 'fixture.pid')), 'Timeout fixture did not start');
  const silentPid = Number(readFileSync(join(silentRuntime, 'fixture.pid'), 'utf8'));
  assert.equal(await closed(silent), 1);
  assert.equal(alive(silentPid), false);
  assert.equal(status(silentRuntime).state, 'failed');
  noEndpoint(silentRuntime);

  const directRuntime = join(runtime, 'direct-wrapper');
  const direct = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: directRuntime });
  const initial = await ready(directRuntime);
  await waitFor(() => direct.messages.includes('ready'), 'Wrapper did not send PM2 ready IPC');
  assert.equal(initial.wrapperPid, direct.child.pid);
  assert.match(initial.endpoint, /wss:\/\/offline-pm2-\d+\.trycloudflare\.com\/neos/);
  assert.equal(readFileSync(join(directRuntime, 'endpoint.txt'), 'utf8').trim(), initial.endpoint);
  assert.match(readFileSync(join(directRuntime, 'duel-config.js'), 'utf8'), new RegExp(initial.endpoint.replaceAll('.', '\\.')));
  assert.equal(readFileSync(join(directRuntime, 'quick-tunnel.yml'), 'utf8'), 'protocol: auto\n');
  const duplicate = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: directRuntime });
  assert.equal(await closed(duplicate), 1);
  assert.match(duplicate.stderr, /Another tunnel process is still alive/);
  assert.equal(status(directRuntime).childPid, initial.childPid);
  assert.equal(alive(initial.childPid), true);
  const orphanRuntime = join(runtime, 'live-child-with-dead-owner');
  mkdirSync(orphanRuntime);
  writeFileSync(join(orphanRuntime, 'owner.json'), JSON.stringify({
    runId: 'test-orphan', wrapperPid: duplicate.child.pid, childPid: initial.childPid,
  }));
  const orphanBlocked = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: orphanRuntime });
  assert.equal(await closed(orphanBlocked), 1);
  assert.match(orphanBlocked.stderr, /Another tunnel process is still alive/);
  assert.equal(alive(initial.childPid), true);
  assert.ok(!existsSync(join(orphanRuntime, 'fixture.pid')));
  direct.child.send('shutdown');
  assert.equal(await closed(direct), 0);
  assert.equal(alive(initial.childPid), false);
  assert.equal(status(directRuntime).state, 'stopped');
  noEndpoint(directRuntime);
  assert.ok(!existsSync(join(directRuntime, 'owner.json')));

  const failedRuntime = join(runtime, 'child-crash');
  const crashed = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: failedRuntime, FIXTURE_MODE: 'crash' });
  await ready(failedRuntime);
  assert.equal(await closed(crashed), 1);
  assert.match(crashed.stderr, /cloudflared exited \(7\)/);
  assert.equal(status(failedRuntime).state, 'failed');
  noEndpoint(failedRuntime);

  // A dead owner's lock can recover; a live child is never killed by a second
  // launcher merely because it appears in a lock file.
  const staleRuntime = join(runtime, 'stale-owner');
  mkdirSync(staleRuntime);
  writeFileSync(join(staleRuntime, 'owner.json'), JSON.stringify({ runId: 'test-stale', wrapperPid: direct.child.pid, childPid: initial.childPid }));
  const stale = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: staleRuntime });
  const recovered = await ready(staleRuntime);
  assert.equal(recovered.wrapperPid, stale.child.pid);
  stale.child.send('shutdown');
  assert.equal(await closed(stale), 0);

  const invalidOwnerRuntime = join(runtime, 'invalid-owner');
  mkdirSync(invalidOwnerRuntime);
  const invalidOwnerText = '{"wrapperPid":0,"childPid":null}';
  writeFileSync(join(invalidOwnerRuntime, 'owner.json'), invalidOwnerText);
  const invalidOwner = launch({ ...common, NEOS_TUNNEL_RUNTIME_DIR: invalidOwnerRuntime });
  assert.equal(await closed(invalidOwner), 1);
  assert.match(invalidOwner.stderr, /Invalid tunnel ownership record/);
  assert.equal(readFileSync(join(invalidOwnerRuntime, 'owner.json'), 'utf8'), invalidOwnerText);

  const managedRuntime = join(runtime, 'managed-runtime');
  Object.assign(pm2Environment, common, {
    NEOS_TUNNEL_RUNTIME_DIR: managedRuntime, NEOS_TUNNEL_START_TIMEOUT_MS: '5000',
    FIXTURE_CRASH_ONCE_MARKER: join(runtime, 'crashed-once.txt'),
  });
  pm2Used = true;
  await pm2('start', ecosystem, '--only', 'neos-quick-tunnel');
  const firstManaged = await ready(managedRuntime);
  await waitFor(() => status(managedRuntime).state === 'failed', 'Child failure did not clear managed state');
  noEndpoint(managedRuntime);
  const restarted = await waitFor(() => {
    const value = status(managedRuntime);
    return value.state === 'ready' && value.wrapperPid !== firstManaged.wrapperPid ? value : false;
  }, 'PM2 did not restart the crashed wrapper', 25000);
  assert.equal(alive(firstManaged.wrapperPid), false);
  assert.equal(alive(firstManaged.childPid), false);
  assert.notEqual(restarted.endpoint, firstManaged.endpoint);
  const list = JSON.parse(await pm2('jlist'));
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'neos-quick-tunnel');
  assert.equal(list[0].pm2_env.status, 'online');
  assert.ok(list[0].pm2_env.restart_time >= 1);
  assert.equal(list[0].pm2_env.shutdown_with_message, true);
  assert.equal(list[0].pm2_env.exec_mode, 'fork_mode');
  await pm2('save');
  const saved = JSON.parse(readFileSync(join(pm2Environment.PM2_HOME, 'dump.pm2'), 'utf8'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'neos-quick-tunnel');
  await pm2('stop', 'neos-quick-tunnel');
  await waitFor(() => status(managedRuntime).state === 'stopped', 'PM2 stop did not deliver shutdown IPC');
  assert.equal(alive(restarted.childPid), false);
  assert.equal(alive(restarted.wrapperPid), false);
  noEndpoint(managedRuntime);
  await pm2('restart', 'neos-quick-tunnel');
  const restartedByOperator = await ready(managedRuntime);
  assert.notEqual(restartedByOperator.childPid, restarted.childPid);
  assert.notEqual(restartedByOperator.endpoint, restarted.endpoint);
  await pm2('delete', 'neos-quick-tunnel');
  await waitFor(() => !alive(restartedByOperator.childPid), 'PM2 delete left cloudflared orphaned');
  noEndpoint(managedRuntime);
  assert.equal(JSON.parse(await pm2('jlist')).length, 0);
  console.log('PM2 tunnel passed: Windows IPC stop/delete, detached CLI, crash/restart, fresh endpoint/config, gateway/registration failure, owned child cleanup, duplicate protection, spaces/unrelated cwd, save. No public tunnel was opened.');
} finally {
  for (const child of [...children]) {
    if (child.exitCode !== null) continue;
    const drained = new Promise((done) => child.once('close', done));
    if (child.connected) child.send('shutdown');
    else child.kill();
    let deadline;
    try { await Promise.race([drained, new Promise((done) => { deadline = setTimeout(done, 10000); })]); }
    finally { clearTimeout(deadline); }
  }
  if (pm2Used) {
    try { await pm2('delete', 'neos-quick-tunnel'); } catch { /* Already deleted or not started. */ }
    await pm2('kill');
  }
  if (gateway.listening) await new Promise((done) => gateway.close(done));
  const checked = realpathSync(runtime);
  assert.ok(checked.startsWith(realpathSync(audit) + sep), 'Cleanup must remain in this test audit directory.');
  rmSync(checked, { recursive: true, force: true });
}
