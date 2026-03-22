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
