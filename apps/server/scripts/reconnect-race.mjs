// Reproduces a reconnect race against a running server: partysocket reuses its connection id (`_pk`)
// on every reconnect, so the old socket's close can land after the new socket has joined. The player
// must stay connected.
// Usage: node scripts/reconnect-race.mjs [baseUrl]
import WS from 'ws';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const wsBase = base.replace(/^http/, 'ws');
const { code } = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
const pk = crypto.randomUUID();
const deviceId = `race-device-${code}`;
const url = `${wsBase}/parties/room/${code}?_pk=${pk}&deviceId=${deviceId}&name=Racer`;

function open() {
  const ws = new WS(url);
  const s = { ws, last: null, closed: null };
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'state') s.last = m;
  });
  ws.on('close', (c) => (s.closed = c));
  return new Promise((res, rej) => {
    ws.on('error', rej);
    const t = setInterval(() => {
      if (s.last) {
        clearInterval(t);
        res(s);
      }
    }, 20);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meConnected = (s) => s.last.room.members.find((m) => m.id === s.last.room.you)?.connected;

const a = await open();
const b = await open(); // reconnect with the same _pk while the old socket is still open
await sleep(300);
if (a.ws.readyState === WS.OPEN) a.ws.close(1000); // the old socket's close arrives late
await sleep(800);
const ok = meConnected(b) === true;
console.log(`room ${code}: old socket server-closed=${a.closed ?? 'no'}; player connected after old close: ${meConnected(b)}`);
b.ws.close();
process.exit(ok ? 0 : 1);
