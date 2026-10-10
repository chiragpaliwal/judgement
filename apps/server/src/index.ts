import { getServerByName, routePartykitRequest } from 'partyserver';
import { CODE_ALPHABET, CODE_LENGTH, isRoomCode } from '@judgement/engine';

import { readStats } from './metrics';

export { Room } from './room';

/** Constant-time string comparison, so the stats token can't be guessed byte by byte. */
function tokenMatches(given: string, expected: string) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const stub = await getServerByName(env.Room, code);
        const country = request.cf?.country;
        const res = await stub.fetch(
          new Request(`https://room/init`, { method: 'POST', headers: typeof country === 'string' ? { 'x-country': country } : {} }),
        );
        if (res.ok) return Response.json({ code });
      }
      return new Response('Could not allocate a room', { status: 503 });
    }

    if (url.pathname === '/api/stats' && request.method === 'GET') {
      const token = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
      if (!env.STATS_TOKEN || !tokenMatches(token, env.STATS_TOKEN)) return new Response('Unauthorized', { status: 401 });
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      return Response.json(await readStats(env.DB, days, Date.now()), { headers: { 'cache-control': 'no-store' } });
    }

    const m = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
    if (m && request.method === 'GET') {
      const code = m[1].toUpperCase();
      if (!isRoomCode(code)) return Response.json({ exists: false }, { status: 404 });
      const stub = await getServerByName(env.Room, code);
      return stub.fetch(new Request(`https://room/status`));
    }

    if (url.pathname.startsWith('/parties/')) {
      const res = await routePartykitRequest(request, env);
      if (res) return res;
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
