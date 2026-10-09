// Disconnect flow: a socket player drops mid-game; the browser host sees the pause panel.
import { chromium } from '@playwright/test';
import PartySocket from 'partysocket';
import WS from 'ws';
import fs from 'node:fs';

const out = process.argv[2] ?? 'pause-shots';
const base = process.env.BASE ?? 'http://127.0.0.1:8787';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
await page.goto(base + '/');
await page.getByPlaceholder('What should the table call you?').fill('Riya');
await page.getByRole('button', { name: 'Create a room' }).click();
await page.waitForURL(/\/r\//);
const code = page.url().split('/r/')[1];
const mk = (i, name) => new PartySocket({ host: new URL(base).host, party: 'room', room: code, protocol: 'ws', WebSocket: WS, query: { deviceId: `pause-${i}-${code}-xxxx`, name } });
const a = mk(1, 'Ben');
const b = mk(2, 'Mei');
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /^Deal/ }).click();
await page.waitForTimeout(1500);
a.close();
console.log('Ben disconnected');
await page.waitForTimeout(6500);
const visible = await page.getByRole('alertdialog').isVisible();
console.log('pause panel visible:', visible);
await page.screenshot({ path: `${out}/1-paused.png` });
await page.getByRole('button', { name: /Keep waiting/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/2-voted.png` });
// Mei votes too -> majority -> +60s
b.send(JSON.stringify({ type: 'voteWait' }));
await page.waitForTimeout(500);
const timer = await page.locator('[role=alertdialog] .mono').first().innerText();
console.log('hold timer after majority vote:', timer);
// Ben comes back
const a2 = mk(1, 'Ben');
await page.waitForTimeout(1500);
console.log('pause panel after reconnect:', await page.getByRole('alertdialog').isVisible());
await page.screenshot({ path: `${out}/3-resumed.png` });
a2.close();
b.close();
await browser.close();
process.exit(visible ? 0 : 1);
