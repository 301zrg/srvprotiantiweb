'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

function integer(value, fallback, name, minimum, maximum) {
  const text = value === undefined || value === '' ? String(fallback) : value;
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer.`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function readSettings(environment = process.env, directory = __dirname) {
  const protocol = environment.NEOS_TUNNEL_PROTOCOL || 'auto';
  if (!['auto', 'http2', 'quic'].includes(protocol)) {
    throw new Error('NEOS_TUNNEL_PROTOCOL must be auto, http2 or quic.');
  }
  return {
    binary: path.resolve(directory, environment.NEOS_CLOUDFLARED_PATH || 'cloudflared.exe'),
    runtime: path.resolve(directory, environment.NEOS_TUNNEL_RUNTIME_DIR || 'runtime/pm2-quick'),
    port: integer(environment.NEOS_GATEWAY_PORT, 7978, 'NEOS_GATEWAY_PORT', 1, 65535),
    gatewayWaitMs: integer(environment.NEOS_TUNNEL_GATEWAY_WAIT_MS, 30000, 'NEOS_TUNNEL_GATEWAY_WAIT_MS', 250, 300000),
    startTimeoutMs: integer(environment.NEOS_TUNNEL_START_TIMEOUT_MS, 90000, 'NEOS_TUNNEL_START_TIMEOUT_MS', 250, 300000),
    protocol,
  };
}

function endpointFromLog(text) {
  const match = text.match(/https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com(?=$|[\s"'<>/|])/);
  return match ? match[0].replace('https://', 'wss://') + '/neos' : null;
}

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    // A process we cannot inspect must never be treated as safe to replace.
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function writeAtomic(filename, value) {
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value, 'utf8');
  fs.renameSync(temporary, filename);
}

function acquireLock(filename, owner) {
  try {
    const descriptor = fs.openSync(filename, 'wx');
    try { fs.writeFileSync(descriptor, JSON.stringify(owner) + '\n'); }
    finally { fs.closeSync(descriptor); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let previous;
    try { previous = JSON.parse(fs.readFileSync(filename, 'utf8')); }
    catch { throw new Error(`Cannot read tunnel lock. Inspect ${filename} before retrying.`); }
    if (typeof previous?.runId !== 'string' || !Number.isSafeInteger(previous.wrapperPid) || previous.wrapperPid <= 0 ||
        (previous.childPid !== null && (!Number.isSafeInteger(previous.childPid) || previous.childPid <= 0))) {
      throw new Error(`Invalid tunnel ownership record. Inspect ${filename} before retrying.`);
    }
    if (isAlive(previous.wrapperPid) || isAlive(previous.childPid)) {
      throw new Error(`Another tunnel process is still alive. Inspect ${filename}; do not start a duplicate.`);
    }
    fs.unlinkSync(filename);
    // Exclusive creation still protects against another simultaneous launcher.
    const descriptor = fs.openSync(filename, 'wx');
    try { fs.writeFileSync(descriptor, JSON.stringify(owner) + '\n'); }
    finally { fs.closeSync(descriptor); }
  }
}

async function waitForGateway(port, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  while (!signal.aborted && Date.now() < deadline) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', cancel);
        socket.destroy();
        resolve(result);
      };
      const cancel = () => finish(false);
      socket.once('connect', () => finish(true));
      socket.once('error', () => finish(false));
      socket.setTimeout(500, () => finish(false));
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    if (connected) return;
    if (!signal.aborted) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (signal.aborted) throw new Error('Tunnel startup cancelled.');
  throw new Error(`Nginx gateway 127.0.0.1:${port} did not start within ${timeoutMs} ms.`);
}

async function run() {
  const settings = readSettings();
  if (!fs.statSync(settings.binary, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing cloudflared: ${settings.binary}. Run Download-Cloudflared.ps1 first.`);
  }
  fs.mkdirSync(settings.runtime, { recursive: true });
  const files = Object.fromEntries(['status.json', 'endpoint.txt', 'duel-config.js', 'owner.json', 'quick-tunnel.yml']
    .map((name) => [name, path.join(settings.runtime, name)]));
  const owner = { runId: crypto.randomUUID(), wrapperPid: process.pid, childPid: null };
  acquireLock(files['owner.json'], owner);
  const startedAt = new Date().toISOString();
  const abort = new AbortController();
  let child;
  let startupTimer;
  let closing = false;
  let endpoint = null;
  let registered = false;
  let ready = false;

  const writeStatus = (state, message = null) => {
    writeAtomic(files['status.json'], JSON.stringify({
      ...owner, state, startedAt, updatedAt: new Date().toISOString(),
      endpoint: state === 'ready' ? endpoint : null, message,
    }, null, 2) + '\n');
  };
  const clearEndpoint = () => {
    fs.rmSync(files['endpoint.txt'], { force: true });
    fs.rmSync(files['duel-config.js'], { force: true });
  };
  const stopChild = () => new Promise((resolve) => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return resolve();
    let forceTimer;
    let deadline;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(forceTimer);
      clearTimeout(deadline);
      resolve();
    };
    child.once('close', finish);
    try { child.kill('SIGTERM'); }
    catch (error) { console.error(`Could not stop cloudflared PID ${child.pid}: ${error.message}`); }
    forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 4000);
    deadline = setTimeout(finish, 7000);
  });
  const finish = async (code, reason) => {
    if (closing) return;
    closing = true;
    abort.abort();
    clearTimeout(startupTimer);
    try {
      clearEndpoint();
      writeStatus('stopping', reason);
      await stopChild();
      if (child?.pid && isAlive(child.pid)) {
        code = 1;
        reason = `cloudflared PID ${child.pid} is still alive; inspect owner.json before restarting.`;
        writeStatus('failed', reason);
        // Keep the ownership record rather than starting a second live child.
      } else {
        writeStatus(code === 0 ? 'stopped' : 'failed', reason);
        fs.rmSync(files['owner.json'], { force: true });
      }
      console[code === 0 ? 'log' : 'error'](reason);
    } catch (error) {
      code = 1;
      console.error(`Tunnel cleanup failed: ${error.message}`);
      // Even a metadata write failure must not leave our child running.
      await stopChild();
    }
    process.exit(code);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => { void finish(0, `Tunnel stopped by ${signal}.`); });
  }
  // PM2 uses IPC shutdown on Windows, where Unix signals are not reliable.
  process.on('message', (message) => {
    if (message === 'shutdown') void finish(0, 'Tunnel stopped by PM2.');
  });
  process.on('uncaughtException', (error) => { void finish(1, `Tunnel error: ${error.message}`); });
  process.on('unhandledRejection', (error) => { void finish(1, `Tunnel error: ${error?.message || String(error)}`); });

  try {
    clearEndpoint();
    writeStatus('starting');
    console.log(`Waiting for Nginx gateway 127.0.0.1:${settings.port}...`);
    await waitForGateway(settings.port, settings.gatewayWaitMs, abort.signal);
    if (closing) return;
    writeAtomic(files['quick-tunnel.yml'], `protocol: ${settings.protocol}\n`);
    child = spawn(settings.binary, [
      'tunnel', '--config', files['quick-tunnel.yml'], '--no-autoupdate',
      '--protocol', settings.protocol, '--url', `http://127.0.0.1:${settings.port}`,
      '--metrics', '127.0.0.1:0',
    ], { cwd: settings.runtime, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    owner.childPid = child.pid || null;
    writeAtomic(files['owner.json'], JSON.stringify(owner) + '\n');
    writeStatus('starting');
    const tails = { stdout: '', stderr: '' };
    const record = (channel, chunk) => {
      (channel === 'stdout' ? process.stdout : process.stderr).write(chunk);
      if (closing) return;
      tails[channel] = (tails[channel] + chunk).slice(-8192);
      endpoint ||= endpointFromLog(tails[channel]);
      registered ||= tails[channel].includes('Registered tunnel connection');
      if (!ready && endpoint && registered) {
        ready = true;
        clearTimeout(startupTimer);
        writeAtomic(files['endpoint.txt'], endpoint + '\n');
        writeAtomic(files['duel-config.js'], '// Public operator endpoint; no credentials.\n' +
          `window.__SRVPRO_DUEL_CONFIG__ = ${JSON.stringify({ duelWebSocketUrl: endpoint })};\n`);
        writeStatus('ready');
        console.log(`Neos test endpoint: ${endpoint}`);
        console.log(`Endpoint file: ${files['endpoint.txt']}`);
        console.log('PM2 manages this process. A new tunnel URL requires updating the static website configuration.');
        if (process.send) process.send('ready');
      }
    };
    for (const channel of ['stdout', 'stderr']) {
      child[channel].setEncoding('utf8');
      child[channel].on('data', (chunk) => record(channel, chunk));
    }
    child.once('error', (error) => { void finish(1, `cloudflared failed to start: ${error.message}`); });
    child.once('close', (code, signal) => {
      if (!closing) void finish(1, `cloudflared exited (${signal || code}); PM2 will apply its restart policy.`);
    });
    startupTimer = setTimeout(() => {
      void finish(1, `Tunnel registration timed out after ${settings.startTimeoutMs} ms. Check outbound 7844 and PM2 logs.`);
    }, settings.startTimeoutMs);
  } catch (error) {
    if (!closing) await finish(1, error.message);
  }
}

module.exports = { endpointFromLog, readSettings, waitForGateway };
if (require.main === module) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
