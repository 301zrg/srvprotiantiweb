import assert from 'node:assert/strict';
import worker from '../deployment/test-entry/worker.mjs';
const original = globalThis.fetch;
const calls = [];
globalThis.fetch = async request => {
  calls.push(request);
  return new Response(request.method === 'HEAD' ? null : 'preview', { status: 200, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Set-Cookie': 'discard=true', Location: 'https://codex-client-preview-20261019-black-surf-69e5.1627406938.workers.dev/next' } });
};
try {
  assert.equal((await worker.fetch(new Request('https://test.ocg1103nexus.com/', { method: 'POST' }))).status, 405);
  assert.equal(calls.length, 0);
  for (const method of ['GET', 'HEAD']) {
    const redirect = await worker.fetch(new Request('http://test.ocg1103nexus.com//evil.example/assets/a?room=TT&name=%E6%B5%8B%E8%AF%95', { method }));
    assert.equal(redirect.status, 308, `${method} must enter the secure origin before loading assets`);
    assert.equal(redirect.headers.get('Location'), 'https://test.ocg1103nexus.com//evil.example/assets/a?room=TT&name=%E6%B5%8B%E8%AF%95');
    assert.equal(redirect.body, null);
    assert.equal(calls.length, 0, 'HTTP must not fetch or return the preview page');
  }
  const result = await worker.fetch(new Request('https://test.ocg1103nexus.com//evil.example/assets/a?x=1', { headers: { Cookie: 'private=1', Authorization: 'private', Range: 'bytes=0-5' } }));
  assert.equal(calls[0].url, 'https://codex-client-preview-20261019-black-surf-69e5.1627406938.workers.dev//evil.example/assets/a?x=1');
  assert.equal(calls[0].headers.has('Cookie'), false);
  assert.equal(calls[0].headers.has('Authorization'), false);
  assert.equal(calls[0].headers.get('Range'), 'bytes=0-5');
  assert.equal(result.headers.get('Set-Cookie'), null);
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(result.headers.get('Location'), 'https://test.ocg1103nexus.com/next');
  assert.equal(await result.text(), 'preview');
  assert.equal((await worker.fetch(new Request('https://test.ocg1103nexus.com/a', { method: 'HEAD' }))).body, null);
  console.log('PASS isolated fixed-preview entry, methods, paths, headers and redirect identity');
} finally { globalThis.fetch = original; }
