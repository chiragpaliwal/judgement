// Drives one real browser player through a game against socket players + bots,
// saving screenshots of each state. Usage: node e2e/shots.mjs <outDir> [width height] [sockets] [bots] [start]
import { chromium } from '@playwright/test';
import PartySocket from 'partysocket';
import WS from 'ws';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots';
const W = Number(process.argv[3] ?? 390);
const H = Number(process.argv[4] ?? 844);
const sockets = Number(process.argv[5] ?? 2);
const bots = Number(process.argv[6] ?? 3);
const start = Number(process.argv[7] ?? 4);
const base = process.env.BASE ?? 'http://127.0.0.1:8787';
fs.mkdirSync(out, { recursive: true });
const RANK = '23456789TJQKA';
const NAMES = ['Ira', 'Mei', 'Dev', 'Asha', 'Ben', 'Ravi'];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
let n = 0;
const shot = async (name) => {
  const f = `${out}/${String(++n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f });
  console.log('shot', f);
};

await page.goto(base + '/');
await page.waitForTimeout(700);
await shot('home');
await page.getByPlaceholder('What should the table call you?').fill('Riya');
await page.getByRole('button', { name: 'Create a room' }).click();
await page.waitForURL(/\/r\//);
const code = page.url().split('/r/')[1];
await page.waitForTimeout(600);

// Socket players.
const clients = [];
for (let i = 0; i < sockets; i++) {
  const s = new PartySocket({ host: new URL(base).host, party: 'room', room: code, protocol: 'ws', WebSocket: WS, query: { deviceId: `shot-${i}-${code}-xxxx`, name: NAMES[i] } });
  const c = { s, key: '' };
  s.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.type !== 'state' || !m.game) return;
    const { room, game } = m;
    const r = game.round;
    if (game.phase === 'roundEnd') {
      if (!room.ready.includes(room.you)) setTimeout(() => s.send(JSON.stringify({ type: 'ready' })), 1500);
      return;
    }
    const key = `${game.phase}-${r.index}-${r.turn}-${r.tricksDone}-${r.hand.length}`;
    if (room.pause || r.turn !== game.me || c.key === key) return;
    c.key = key;
    setTimeout(() => {
      if (game.phase === 'bidding') {
        const total = r.bids.reduce((a, b) => a + (b ?? 0), 0);
        let bid = Math.min(r.cards, 1 + (i % 2));
        if (game.me === r.dealer && total + bid === r.cards) bid = bid === 0 ? 1 : bid - 1;
        s.send(JSON.stringify({ type: 'bid', bid }));
      } else {
        const open = r.tricks[r.tricks.length - 1];
        const led = open && open.winner === null && open.plays.length ? open.plays[0].card[1] : null;
        const follow = led ? r.hand.filter((x) => x[1] === led) : [];
        const legal = follow.length ? follow : r.hand;
        const card = [...legal].sort((a, b) => RANK.indexOf(b[0]) - RANK.indexOf(a[0]))[i % 2 ? 0 : legal.length - 1];
        s.send(JSON.stringify({ type: 'play', card }));
      }
    }, 900);
  });
  clients.push(c);
}
await page.waitForTimeout(800);
for (let b = 0; b < bots; b++) {
  await page.getByRole('button', { name: 'Add bot' }).click();
  await page.waitForTimeout(150);
}
// set start cards
const target = start;
for (let k = 0; k < 20; k++) {
  const v = Number(await page.locator('[aria-live="polite"].mono').first().innerText());
  if (v === target) break;
  await page.getByRole('button', { name: v > target ? 'Fewer cards' : 'More cards' }).click();
  await page.waitForTimeout(120);
}
await page.waitForTimeout(400);
await shot('lobby');
await page.getByRole('button', { name: /^Deal/ }).click();

const seen = new Set();
const deadline = Date.now() + 8 * 60_000;
let summaries = 0;
while (Date.now() < deadline) {
  await page.waitForTimeout(350);
  if (await page.getByRole('button', { name: 'Rematch, same room' }).isVisible().catch(() => false)) {
    await page.waitForTimeout(1600);
    await shot('results');
    break;
  }
  if (await page.getByRole('button', { name: 'Ready' }).isVisible().catch(() => false)) {
    await page.waitForTimeout(1400);
    await shot(`summary-${++summaries}`);
    if (process.env.ONE_ROUND) break;
    if (summaries === 1) {
      await page.getByRole('button', { name: 'Full scoreboard' }).click();
      await page.waitForTimeout(700);
      await shot('scoreboard');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: 'Ready' }).click();
    continue;
  }
  const bidSheet = page.getByRole('radiogroup', { name: 'Bid' });
  if (await bidSheet.isVisible().catch(() => false)) {
    await page.waitForTimeout(500);
    const hook = await page.getByText('You’re on the hook').isVisible().catch(() => false);
    const k = hook ? 'bid-hook' : 'bid';
    if (!seen.has(k) || hook) {
      seen.add(k);
      await shot(k);
    }
    const opts = bidSheet.getByRole('radio');
    const count = await opts.count();
    for (let i = Math.min(1, count - 1); i < count; i++) {
      const o = opts.nth(i);
      if ((await o.getAttribute('aria-disabled')) === 'true') continue;
      await o.click();
      break;
    }
    await page.waitForTimeout(250);
    if (!seen.has('bid-picked')) {
      seen.add('bid-picked');
      await shot('bid-picked');
    }
    await page.getByRole('button', { name: /^Bid \d+/ }).click();
    continue;
  }
  const hand = page.locator('section.fan button.hc:not([disabled]), button.hero:not([disabled])');
  const playable = await hand.count();
  const pickVisible = await page.getByRole('button', { name: /^Pick a card/ }).isVisible().catch(() => false);
  if (playable > 0 && pickVisible) {
    await page.waitForTimeout(300);
    // Fanned and two-row hands tilt and overlap cards: click a point that actually hits this one.
    // Re-measured on each try, since the hand may still be settling from the last play.
    const target = hand.nth(playable - 1);
    for (let tries = 0; ; tries++) {
      const pt = await target.evaluate((el) => {
        const r = el.getBoundingClientRect();
        for (let y = r.top + 8; y < r.bottom; y += 6)
          for (let x = r.left + 4; x < r.right; x += 4) if (el.contains(document.elementFromPoint(x, y))) return { x: x - r.left, y: y - r.top };
        return null;
      });
      try {
        await target.click({ ...(pt ? { position: pt } : {}), timeout: 2000 });
        break;
      } catch (e) {
        if (tries >= 4) throw e;
      }
    }
    await page.waitForTimeout(250);
    if (!seen.has('play-turn') || Math.random() < 0.15) {
      seen.add('play-turn');
      await shot('play-turn');
    }
    if (!seen.has('cards-seen') && (await page.getByRole('button', { name: 'Cards seen this round' }).isVisible())) {
      seen.add('cards-seen');
      await page.getByRole('button', { name: 'Cards seen this round' }).click();
      await page.waitForTimeout(600);
      await shot('cards-seen');
      await page.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: /^Play / }).click();
    await page.waitForTimeout(150);
    if (!seen.has('played')) {
      seen.add('played');
      await shot('played-anim');
    }
    continue;
  }
  if (await page.locator('.stake').isVisible().catch(() => false)) {
    if (!seen.has('waiting')) {
      seen.add('waiting');
      await shot('play-waiting');
    }
  }
  if (await page.locator('.moment').isVisible().catch(() => false)) {
    if (!seen.has('moment')) {
      seen.add('moment');
      await shot('last-trick');
    }
  }
  if (await page.locator('.pill .lbl', { hasText: 'Bidding' }).isVisible().catch(() => false)) {
    if (!seen.has('bidwait')) {
      seen.add('bidwait');
      await page.waitForTimeout(400);
      await shot('bidding-waiting');
    }
  }
}
for (const c of clients) c.s.close();
await browser.close();
process.exit(0);
