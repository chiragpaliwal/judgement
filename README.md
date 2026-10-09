# Judgement

Judgement (Kachuful / Oh Hell) is an online card game where you call exactly how many tricks you'll take. It's for 3 to 7 friends, who join with one link. It runs mobile-first in the browser and installs as an app.

- Rules and product decisions are in [docs/GDD.md](docs/GDD.md).
- UI and UX follow the design spec (kept locally, not in the repo).

## Run it locally

You need Node 22 or later and pnpm 10 or later.

```sh
pnpm install
pnpm dev
```

- `pnpm dev` starts Vite on http://localhost:5173 and the Worker on http://localhost:8787.
- Open http://localhost:5173, create a room, and open the room link in more windows (or tap **Add bot**). You need 3 players to deal.
- To test a production build, run `pnpm build`, then `cd apps/server && npx wrangler dev`, then open http://localhost:8787.

## Checks

```sh
pnpm typecheck
pnpm test          # engine rules + 60 random full games, room server logic, UI geometry/narration
pnpm sim           # 3 socket players + 1 bot play a whole game against a running server (:8787)
pnpm e2e:shots out 390 844 2 3 4   # real browser + 2 socket players + 3 bots; screenshots every state
pnpm e2e:pause out                 # disconnect → pause panel → vote → reconnect
```

The e2e scripts use your installed Google Chrome through Playwright.

## Deploy (Cloudflare free plan)

```sh
cd apps/server && npx wrangler login    # once
pnpm deploy                              # builds the web app and deploys the Worker + Durable Object
```

The app is served at `https://judgement.<your-subdomain>.workers.dev`. To deploy automatically from GitHub, add a `CLOUDFLARE_API_TOKEN` secret. CI deploys every push to `main` (see `.github/workflows/ci.yml`).

## Layout

```
packages/engine   rules, bots, derived values, protocol types (pure TS, tested)
apps/server       Worker entry + Room Durable Object (partyserver)
apps/web          React client (screens/, game/, net/, lib/, ui/)
e2e/              browser-driven scripts
```
