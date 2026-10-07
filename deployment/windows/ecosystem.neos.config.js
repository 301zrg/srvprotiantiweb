const path = require('node:path');
const { readSettings } = require('./neos-quick-tunnel.cjs');
const settings = readSettings();

module.exports = {
  apps: [{
    name: 'neos-quick-tunnel',
    script: path.join(__dirname, 'neos-quick-tunnel.cjs'),
    cwd: __dirname,
    interpreter: process.execPath,
    exec_mode: 'fork',
    instances: 1,
    watch: false,
    autorestart: true,
    restart_delay: 5000,
    min_uptime: settings.gatewayWaitMs + settings.startTimeoutMs + 10000,
    max_restarts: 10,
    wait_ready: true,
    listen_timeout: settings.gatewayWaitMs + settings.startTimeoutMs + 5000,
    shutdown_with_message: true,
    kill_timeout: 10000,
    time: true,
    merge_logs: true,
    env: {
      NEOS_CLOUDFLARED_PATH: settings.binary,
      NEOS_TUNNEL_RUNTIME_DIR: settings.runtime,
      NEOS_GATEWAY_PORT: String(settings.port),
      NEOS_TUNNEL_PROTOCOL: settings.protocol,
      NEOS_TUNNEL_GATEWAY_WAIT_MS: String(settings.gatewayWaitMs),
      NEOS_TUNNEL_START_TIMEOUT_MS: String(settings.startTimeoutMs),
    },
  }],
};
