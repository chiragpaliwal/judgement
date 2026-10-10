# Developing Judgement

How to run, test and deploy the game. For the rules and design decisions, see [GDD.md](GDD.md).

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

Out of the box the app is served at `https://judgement.<your-subdomain>.workers.dev`. The live site uses a custom domain, set by the `routes` entry in `apps/server/wrangler.jsonc`. Change or remove it if you fork the repo.

To deploy automatically from GitHub, add a `CLOUDFLARE_API_TOKEN` secret (with Workers Scripts, Workers Routes, D1 Edit and DNS edit permissions for a custom domain). CI deploys every push to `main` (see `.github/workflows/ci.yml`).

## Stats (how many games are played)

Rooms and games are recorded in a D1 database (`judgement`) and as structured log lines (`room_created`, `game_started`, `game_ended`). One-time setup:

```sh
cd apps/server
npx wrangler d1 create judgement        # paste the database_id into wrangler.jsonc
npx wrangler secret put STATS_TOKEN     # any long random string
pnpm db:migrate                          # CI also runs this before each deploy
```

Locally run `pnpm --filter @judgement/server db:migrate:local` once. View the numbers at `/stats` (asks for the token), or query directly:

```sh
npx wrangler d1 execute judgement --remote --command "select status, count(*) from games group by status"
```

`status` is `completed`, `ended_early` (host ended it), `abandoned` (room expired mid-game) or `active`. Players are stored as a truncated hash of their device id.

## Layout

```
packages/engine   rules, bots, derived values, protocol types (pure TS, tested)
apps/server       Worker entry + Room Durable Object (partyserver)
apps/web          React client (screens/, game/, net/, lib/, ui/)
e2e/              browser-driven scripts
```
