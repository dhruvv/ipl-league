#!/usr/bin/env node
/**
 * Fetch CricketData.org series HTML and extract match UUIDs in schedule order.
 * Proof: plain GET includes /cricket-data-formats/matches/...-{uuid} in HTML.
 *
 * Usage:
 *   node scripts/cricketdata-series-match-ids.mjs --url "https://cricketdata.org/..."
 *   node scripts/cricketdata-series-match-ids.mjs --url "..." --post-reconcile \
 *     --app-url "https://your-app.com" --league-id "cuid" --secret "$SCORING_SYNC_SECRET"
 */

const MATCH_PATH_REGEX =
  /cricket-data-formats\/matches\/[^"'\s>]+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_TAIL =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseArgs(argv) {
  const o = {
    url: null,
    postReconcile: false,
    appUrl: null,
    leagueId: null,
    secret: null,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--url") o.url = argv[++i];
    else if (argv[i] === "--post-reconcile") o.postReconcile = true;
    else if (argv[i] === "--app-url") o.appUrl = argv[++i]?.replace(/\/$/, "");
    else if (argv[i] === "--league-id") o.leagueId = argv[++i];
    else if (argv[i] === "--secret") o.secret = argv[++i];
    else if (argv[i] === "--dry-run") o.dryRun = true;
  }
  return o;
}

function extractFromHtml(html) {
  const seen = new Set();
  const out = [];
  let m;
  const re = new RegExp(MATCH_PATH_REGEX.source, "gi");
  while ((m = re.exec(html)) !== null) {
    const path = m[0];
    const um = path.match(UUID_TAIL);
    if (!um) continue;
    const externalMatchId = um[1].toLowerCase();
    if (seen.has(externalMatchId)) continue;
    seen.add(externalMatchId);
    out.push({ order: out.length + 1, externalMatchId, path });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.url) {
    console.error(
      "Usage: node scripts/cricketdata-series-match-ids.mjs --url <series-page-url> [--post-reconcile --app-url https://... --league-id <id> --secret <SCORING_SYNC_SECRET>]"
    );
    process.exit(1);
  }

  const res = await fetch(args.url, {
    headers: {
      "User-Agent": "PlayerAuction/1.0 cricketdata-series-match-ids",
    },
  });
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const html = await res.text();
  const matches = extractFromHtml(html);

  const payload = { matches, sourceUrl: args.url, count: matches.length };
  console.log(JSON.stringify(payload, null, 2));

  if (!args.postReconcile || args.dryRun) return;

  if (!args.appUrl || !args.leagueId || !args.secret) {
    console.error(
      "post-reconcile requires --app-url, --league-id, and --secret"
    );
    process.exit(1);
  }

  const reconcileUrl = `${args.appUrl}/api/leagues/${args.leagueId}/matches/reconcile-scrape`;
  const r = await fetch(reconcileUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.secret}`,
    },
    body: JSON.stringify({ matches: matches.map((m) => ({ externalMatchId: m.externalMatchId })) }),
  });
  const body = await r.text();
  if (!r.ok) {
    console.error("reconcile-scrape failed:", r.status, body);
    process.exit(1);
  }
  console.error("reconcile-scrape:", body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
