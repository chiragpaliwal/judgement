// Plays a full game against a running server with N socket clients (+ bots).
// Usage: node scripts/sim.mjs [baseUrl] [humans] [bots] [startCards]
import PartySocket from 'partysocket';
import WS from 'ws';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const humans = Number(process.argv[3] ?? 3);
const bots = Number(process.argv[4] ?? 1);
const startCards = Number(process.argv[5] ?? 4);
const host = new URL(base).host;
const RANK = '23456789TJQKA';

const { code } = await (await fetch(`${base}/api/rooms`, { method: 'POST' })).json();
console.log('room', code);

let finished = 0;
const clients = [];
function client(i) {
  const s = new PartySocket({ host, party: 'room', room: code, protocol: 'ws', WebSocket: WS, query: { deviceId: `sim-device-${i}-${code}`, name: `Sim${i}` } });
  const c = { s, i, state: null, sent: '' };
  s.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'error') console.log(`client ${i} error`, m.code);
    if (m.type !== 'state') return;
    c.state = m;
    act(c);
  });
  return c;
}

function act(c) {
  const { room, game } = c.state;
  if (!game) return;
  const me = game.me;
  const key = `${game.phase}-${game.round.index}-${game.round.turn}-${game.round.tricksDone}-${game.round.hand.length}-${room.pause ? 1 : 0}`;
  if (game.phase === 'gameEnd') {
    if (!c.done) {
      c.done = true;
      finished++;
      if (c.i === 0) console.log('final totals', game.totals.join(' '), 'rounds', game.history.length);
    }
    return;
  }
  if (game.phase === 'roundEnd') {
    if (!room.ready.includes(room.you) && c.sent !== key) {
      c.sent = key;
      c.s.send(JSON.stringify({ type: 'ready' }));
    }
    return;
  }
  if (room.pause || game.round.turn !== me || c.sent === key) return;
  c.sent = key;
  const r = game.round;
  setTimeout(() => {
    if (game.phase === 'bidding') {
      const total = r.bids.reduce((a, b) => a + (b ?? 0), 0);
      let bid = 0;
      if (me === r.dealer && total + bid === r.cards) bid = 1;
      c.s.send(JSON.stringify({ type: 'bid', bid }));
    } else {
      const open = r.tricks[r.tricks.length - 1];
      const led = open && open.winner === null && open.plays.length ? open.plays[0].card[1] : null;
      const follow = led ? r.hand.filter((x) => x[1] === led) : [];
      const legal = follow.length ? follow : r.hand;
      const card = [...legal].sort((a, b) => RANK.indexOf(a[0]) - RANK.indexOf(b[0]))[0];
      c.s.send(JSON.stringify({ type: 'play', card }));
    }
  }, 30);
}

for (let i = 0; i < humans; i++) clients.push(client(i));
await new Promise((r) => setTimeout(r, 800));
const h = clients[0].s;
for (let b = 0; b < bots; b++) h.send(JSON.stringify({ type: 'addBot' }));
h.send(JSON.stringify({ type: 'setSettings', startCards }));
await new Promise((r) => setTimeout(r, 300));
h.send(JSON.stringify({ type: 'start' }));

const deadline = Date.now() + 240_000;
while (finished < humans && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
for (const c of clients) c.s.close();
if (finished < humans) {
  console.error('FAILED: game did not finish', clients.map((c) => c.state?.game?.phase));
  process.exit(1);
}
console.log('OK: full game finished for all clients');
process.exit(0);
