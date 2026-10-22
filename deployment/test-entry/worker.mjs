const PREVIEW = 'https://codex-client-preview-20261019-black-surf-69e5.1627406938.workers.dev';

/** Only a static entry for the named preview; no online duel or arbitrary proxy. */
export default {
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const incoming = new URL(request.url);
    if (incoming.protocol === 'http:') {
      incoming.protocol = 'https:';
      return new Response(null, { status: 308, headers: { Location: incoming.href, 'X-Robots-Tag': 'noindex, nofollow' } });
    }
    const upstream = new URL(PREVIEW);
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    const headers = new Headers(request.headers);
    for (const name of ['host', 'cookie', 'authorization']) headers.delete(name);
    const result = await fetch(new Request(upstream, { method: request.method, headers, redirect: 'manual' }));
    const outgoing = new Headers(result.headers);
    outgoing.set('X-Robots-Tag', 'noindex, nofollow');
    outgoing.delete('Set-Cookie');
    const location = outgoing.get('Location');
    if (location?.startsWith(PREVIEW + '/')) outgoing.set('Location', incoming.origin + location.slice(PREVIEW.length));
    return new Response(request.method === 'HEAD' ? null : result.body, { status: result.status, statusText: result.statusText, headers: outgoing });
  },
};
