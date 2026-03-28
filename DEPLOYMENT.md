# Deployment Guide

## Prerequisites

- Docker + Docker Compose
- A domain (for Cloudflare Tunnel, optional)
- A CricAPI key from [cricketdata.org](https://cricketdata.org) (for live scoring)

## Quick Start (Single Server)

1. **Clone and configure:**
   ```bash
   cp .env.example .env
   # Edit .env with production values:
   #   POSTGRES_PASSWORD=<strong-password>
   #   AUTH_SECRET=<random-string>
   #   AUTH_URL=https://your-domain.com
   #   CRICAPI_KEY=<your-key>
   #   POSTGRES_PORT=5433  # if 5432 is taken
   ```

2. **Deploy with Docker Compose:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

3. **Run migrations:**
   ```bash
   docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
   ```

4. **Access the app** at `http://your-server:3000`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Auto | - | Set automatically by docker-compose.prod.yml |
| `POSTGRES_PASSWORD` | Yes | - | Database password |
| `POSTGRES_USER` | No | `postgres` | Database user |
| `POSTGRES_DB` | No | `player_auction` | Database name |
| `POSTGRES_PORT` | No | `5432` | Host port for Postgres (change if 5432 is in use) |
| `APP_PORT` | No | `3000` | Host port for the Next.js app |
| `AUTH_SECRET` | Yes | - | NextAuth.js secret (generate with `openssl rand -base64 32`) |
| `AUTH_URL` | No | `http://localhost:3000` | Public URL of the app |
| `CRICAPI_KEY` | No | - | CricAPI key for live scoring |
| `CRICAPI_FANTASY_RULESET_ID` | No | - | Default cricketdata.org fantasy ruleset id for `match_points` (optional; can set per league in UI) |
| `SCORING_POLL_TZ` | No | `America/Los_Angeles` | Time zone for “match day” fast polling (IPL / PT) |
| `SCORING_POLL_WINDOW_START` | No | `03:00` | Local clock time (in `SCORING_POLL_TZ`) when fast polling may start |
| `SCORING_POLL_WINDOW_END` | No | `16:00` | Local clock time when fast polling window ends |
| `SCORING_POLL_IDLE_OUTSIDE_WINDOW_MS` | No | `3600000` | Poll interval when outside the window (ms) |
| `SCORING_SYNC_SECRET` | No | - | `Authorization: Bearer …` for `POST /api/leagues/:id/matches/reconcile-scrape` and `POST /api/leagues/:id/matches/:matchId/import-scorecard` (cron / backfill) |

## CricketData series page (match IDs)

The CricAPI `series_info` list can be out of order. Ordered match UUIDs can be read from the public series schedule HTML (no browser required). The repo includes:

```bash
bun run cricketdata:series-ids -- --url "https://cricketdata.org/cricket-data-formats/series/…"
```

Optional: push into the app database from a trusted host (set `SCORING_SYNC_SECRET` in `.env` on the server):

```bash
node scripts/cricketdata-series-match-ids.mjs --url "https://…" \
  --post-reconcile --app-url "https://your-domain.com" --league-id "<league-cuid>" \
  --secret "$SCORING_SYNC_SECRET"
```

Admins can also **Preview** / **Reconcile** from the league page in the UI. No separate scraper container is required; schedule the command above with cron if you want daily sync.

## Backfill fantasy points from scorecard

The live poller only ticks **LIVE** matches. If a match moved to **COMPLETED** without a final successful poll (downtime, late `externalMatchId`, or API delay), player rows can be incomplete.

- **UI:** League **Owner/Admin** — open the match page and use **Re-import from scorecard** (same logic as the poller: `match_scorecard` + `match_points` when available).
- **API:** `POST /api/leagues/:leagueId/matches/:matchId/import-scorecard` with admin session cookie **or** `Authorization: Bearer $SCORING_SYNC_SECRET`.

Example (trusted host):

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $SCORING_SYNC_SECRET" \
  "https://your-domain.com/api/leagues/<league-cuid>/matches/<match-cuid>/import-scorecard"
```

Requires `CRICAPI_KEY` and a league match with a valid `externalMatchId`.

## Fantasy scoring (official T20 parity)

Stored points come from **CricketData `match_points`** when the request succeeds (using your fantasy **ruleset id** per league or `CRICAPI_FANTASY_RULESET_ID`). Align that dashboard with your league’s published table (runs 1, 4s/6s bonuses, 50/100, duck −2, wickets 25, maidens, 4w/5w bonuses, catches 8, **caught-and-bowled 33**, stumpings 12, run-outs 6, economy tiers with **2 overs** minimum, strike-rate penalties with **10 balls** minimum for **non-bowlers**). Remove or adjust legacy dashboard rules that conflict (e.g. per-wicket +4, 30-run bonus, duplicate economy tiers, stumping +6, positive SR bonuses if your rules omit them).

If `match_points` fails, the app falls back to **[`src/lib/scoring.ts`](src/lib/scoring.ts)** (`DEFAULT_SCORING_RULES`), which mirrors the same economy/SR bands, duck handling (pure **bowlers** excluded by **league `Player.position`**), and fielding **including optional `cb` on scorecard catching rows**.

**Starting XI (+4)** is **not** applied in-app today: CricketData must expose it in the fantasy ruleset or a lineup field; until then, add that rule only on their side or accept the gap.

## Configurable Postgres Port

If another Postgres instance is already running on port 5432, set `POSTGRES_PORT` in your `.env`:

```bash
POSTGRES_PORT=5433
```

The Docker Compose file maps `$POSTGRES_PORT` on the host to port 5432 inside the container. The `DATABASE_URL` inside the app container always uses port 5432 (the internal Docker network port).

For local development (without Docker for the app), update your `DATABASE_URL` accordingly:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/player_auction"
```

## Database Migrations

This project uses Prisma Migrate for production-safe schema changes.

- **Development:** `bun run db:migrate` (creates + applies migration)
- **Production:** `bun run db:migrate:deploy` (applies pending migrations only)
- **Reset (dev only):** `bun run db:migrate:reset` (drops all data)
- **Quick iteration (dev only):** `bun run db:push` (no migration file)

Never use `db:push` or `db:migrate:reset` in production.

## Cloudflare Tunnel + Failover (Future)

The app is designed for active-passive failover across two homeservers using Cloudflare Tunnel and Load Balancer.

### Architecture

```
Users -> Cloudflare LB -> Tunnel A (Primary) -> Server 1 (App + Postgres Primary)
                       -> Tunnel B (Standby) -> Server 2 (App + Postgres Replica)
```

### Setup (per server)

1. **Install cloudflared:**
   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
   chmod +x /usr/local/bin/cloudflared
   cloudflared tunnel login
   ```

2. **Create a tunnel:**
   ```bash
   cloudflared tunnel create player-auction-primary  # on server 1
   cloudflared tunnel create player-auction-standby   # on server 2
   ```

3. **Configure the tunnel** (`~/.cloudflared/config.yml`):
   ```yaml
   tunnel: <tunnel-id>
   credentials-file: /root/.cloudflared/<tunnel-id>.json
   ingress:
     - hostname: auction.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

4. **Run as a service:**
   ```bash
   cloudflared service install
   systemctl start cloudflared
   ```

### Cloudflare Load Balancer

1. Create a Load Balancer pool in Cloudflare dashboard
2. Add both tunnels as origins
3. Configure health checks pointing to `GET /api/health`
4. Set failover policy: primary tunnel gets all traffic; standby is backup only

### Postgres Streaming Replication

On **primary** server (`postgresql.conf`):
```
wal_level = replica
max_wal_senders = 3
```

On **standby** server, set up as a streaming replica:
```bash
pg_basebackup -h primary-ip -D /var/lib/postgresql/data -U replicator -P -R
```

### Failover Procedure

1. Cloudflare detects primary health check failure (3 consecutive failures, ~30s)
2. Traffic routes to standby tunnel automatically
3. Promote standby Postgres: `pg_ctl promote -D /var/lib/postgresql/data`
4. Standby app connects to its now-primary local Postgres

### What survives failover

- User sessions (JWT-based, stateless)
- All data (Postgres replication, seconds of lag)
- SSE connections reconnect automatically (client-side EventSource)

### What may be lost

- ~30s of SSE events during switchover
- In-flight auction bids (user will see an error and can retry)
- Scoring poller state resets (recovers on next poll cycle)
