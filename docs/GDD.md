# Judgement: game design document

Judgement (also called Kachuful or Oh Hell) is an online trick-taking game for 3 to 7 friends in a private room. It is mobile-first, portrait, and played one-handed. It installs as a PWA.

The UI, tokens, components, motion and accessibility follow the design spec (kept locally, not in the repo) and its reference screens. This document covers the rules, the product decisions and the system design behind them.

## 1. Rules

| Rule | Detail |
|---|---|
| Players | 3 to 7, in a private room joined by link or 4-character code. The host can add bots to empty seats. |
| Deck | Standard 52 cards, no jokers. A is high and 2 is low. |
| Rounds | Count down from `min(startCards, floor(52 / players))` to 1. `startCards` defaults to the maximum, so every card that divides evenly is dealt (13 each for 4 players). The host can lower it. |
| Trump | Rotates **♥ Hearts → ♠ Spades → ♦ Diamonds → ♣ Clubs**, then repeats. Round 1 is always Hearts. |
| Dealer | The server picks the first dealer. The dealer moves one seat clockwise each round, and a rematch moves the first dealer on by one. |
| Bidding | Starts left of the dealer and goes clockwise. Bids are public. Any bid from 0 to the number of cards is allowed. |
| Hook | The dealer bids last and may not bid the number that makes the total of all bids equal the cards dealt. This rule is always on. |
| Play | The player left of the dealer leads the first trick, and each trick's winner leads the next. Players must follow the led suit if they can, otherwise they may play any card. The highest trump wins, or the highest card of the led suit if no trump was played. |
| Scoring | Host picks a mode in the lobby. **Classic** (default): an exact bid scores 10 + bid, any miss scores 0. **High stakes**: the value is 11 × bid + 10 (bid 0: 10, bid 1: 21, bid 9: 109, bid 10: 120); exact scores +value, any miss scores −value. |
| End | After the 1-card round the highest total wins. Tied players share a rank. |

## 2. Room behaviour

| Topic | Decision |
|---|---|
| Identity | Guests only. Each player has a name and an initial avatar. A random `deviceId` in localStorage gets the player their seat back on reconnect. |
| Lobby | The first person to join is host. The host changes settings, adds and removes bots or players, and deals once at least 3 players are present. The room locks once a game starts. |
| Turn timer | The host sets it to Off, 30s or 60s. When it runs out, the server bids the lowest legal bid or plays the lowest legal card. |
| Disconnect | A player is offline when their socket closes, or when it goes 30s without answering the heartbeat (a backgrounded phone often leaves a half-open socket). After 10s offline the game pauses for everyone and the seat is held for 60s. If most connected players vote "Keep waiting", the hold gets another 60s. When the hold runs out without a vote, the game stays paused and the host decides: either **Play their turns** (lowest legal card) or **End game**. A returning player takes their seat back automatically. If the host is the one offline, host rights pass to the next connected player when the hold ends. |
| Between rounds | The round summary appears. The next deal happens 8s after the first Ready, immediately once everyone is Ready, or after 30s if nobody taps Ready. |
| Card tracker | A host setting, on by default. When it is off, the server only sends the current trick and the last trick. |
| Reactions | 😂 👍 🔥 👏 😭 😡, plus 😴 on the pause screen. Each player can send one every 2s. |
| Rematch | Keeps the same room and players, resets scores, and moves the first dealer on by one. |
| Room expiry | A room is deleted 30 minutes after its last activity once nobody is connected. |

## 3. Architecture

```
packages/engine   Pure TS rules: deal, bid/hook, legality, tricks, scoring, redaction, bots,
                  derived display values (DESIGN_SPEC §6), wire protocol types.
apps/server       Cloudflare Worker + one Durable Object per room (partyserver).
                  core.ts = room logic with an injectable clock (unit-tested);
                  room.ts = DO wrapper: sockets, storage, alarms, per-player views.
apps/web          React + Vite + Motion + Zustand. Plain CSS with the spec's tokens.
                  Served as static assets by the same Worker. PWA via vite-plugin-pwa.
```

- **Authoritative server.** The server deals, enforces turn order, legality and the hook rule, and does all scoring. Clients only send intents (`bid`, `play`, and so on), and the server validates each one with zod.
- **Redaction.** Each connection gets its own view: that player's hand plus card counts for everyone else. Seeds, other hands and device ids are never sent.
- **One alarm.** The DO keeps every deadline in its state: bot think time, turn timer, disconnect grace, seat hold, auto-deal and expiry. It runs a single storage alarm for the earliest of them, so it can hibernate between moves.
- **Animation.** The client applies each server snapshot straight away. A finished trick is held on screen for 1s so it can be read, then its cards fly to the winner. Motion handles every transition, and `prefers-reduced-motion` (or the in-app toggle) turns travel into fades.

## 4. Hosting (free tier)

Everything runs on one Cloudflare Worker using the free plan: static assets, `/api/rooms`, and `/parties/room/:code` WebSockets to a SQLite-backed Durable Object with hibernation. No other services are involved.
