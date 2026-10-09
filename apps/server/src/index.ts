import { getServerByName, routePartykitRequest } from 'partyserver';
import { CODE_ALPHABET, CODE_LENGTH, isRoomCode } from '@judgement/engine';

export { Room } from './room';

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
        const res = await stub.fetch(new Request(`https://room/init`, { method: 'POST' }));
        if (res.ok) return Response.json({ code });
      }
      return new Response('Could not allocate a room', { status: 503 });
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
