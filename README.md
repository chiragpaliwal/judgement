# Judgement

**Play now: https://judgement.chiragpaliwal.com**

Judgement (also known as Kachuful or Oh Hell) is a free online card game where you call exactly how many tricks you'll take, then try to hit that number. It's for 3 to 7 friends, who join with one link. There's no sign-up. It runs mobile-first in the browser and installs as an app on your phone.

## How to play

1. Open the site, enter a name, and create a room.
2. Share the room link or 4-character code. Empty seats can be filled with bots.
3. Once at least 3 players are in, the host deals.
4. Each round, everyone bids how many tricks they'll win. Trump rotates ♥ ♠ ♦ ♣, and the cards dealt count down to 1.
5. Hit your bid exactly and you score 10 + your bid. Miss and you score 0. The highest total wins.

Full rules, room behaviour and design decisions are in [docs/GDD.md](docs/GDD.md).

## Features

- Rooms for 3 to 7 players with bots, a host-set turn timer and an optional card tracker
- Reconnects you to your seat after a dropped connection, and pauses the game for everyone while you're away
- Emoji reactions and one-tap rematches
- Installable PWA, built for one-handed portrait play

## Built with

TypeScript, React, Vite, and Cloudflare Workers with Durable Objects (one per room, over WebSockets). The game rules live in a pure, tested TypeScript engine shared by the client and server.

Want to run or hack on it? See [docs/DEVELOPING.md](docs/DEVELOPING.md).
