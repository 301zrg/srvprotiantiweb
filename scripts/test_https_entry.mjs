import assert from 'node:assert/strict';
import worker from '../deployment/static-entry.mjs';

const assetResponse = new Response('static asset', { headers: { 'Cache-Control': 'no-store' } });
const calls = [];
const env = { ASSETS: { fetch(request) { calls.push(request); return assetResponse; } } };

for (const method of ['GET', 'HEAD', 'POST']) {
  const response = await worker.fetch(new Request('http://preview.example.com//evil.example/assets/a?room=TT&name=%E6%B5%8B%E8%AF%95', { method }), env);
  assert.equal(response.status, 308, `${method} must redirect before serving an asset`);
  assert.equal(response.headers.get('Location'), 'https://preview.example.com//evil.example/assets/a?room=TT&name=%E6%B5%8B%E8%AF%95');
  assert.equal(response.body, null);
  assert.equal(calls.length, 0, 'HTTP must not reach the static asset binding');
}
const secureRequest = new Request('https://preview.example.com/assets/a?x=1', { method: 'HEAD', headers: { Range: 'bytes=0-5' } });
assert.equal(await worker.fetch(secureRequest, env), assetResponse, 'HTTPS must retain the asset response, including headers and body');
assert.equal(calls.length, 1);
assert.equal(calls[0], secureRequest, 'HTTPS must pass the original method, URL and headers to the binding');
console.log('PASS shared static entry: HTTP 308, unchanged host/path/query, and HTTPS asset passthrough');
