# Player Auction + Fantasy League

IPL-style player auction and fantasy league platform for a group of friends.

See [PLAN.md](PLAN.md) for the full architecture plan.

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Tailwind CSS v4)
- **PostgreSQL 15** (via Docker)
- **Prisma 7** (ORM with PG adapter)
- **NextAuth.js v5** (credentials-based JWT auth)

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)

### Setup

1. Clone and install dependencies:

```bash
git clone <repo-url>
cd player-auction
npm install
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Set up the database:

```bash
cp .env.example .env
npx prisma generate
npx prisma db push
```

4. Start the dev server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio GUI |
