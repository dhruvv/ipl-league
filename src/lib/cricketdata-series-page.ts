/** Extract CricketData match UUIDs from series schedule HTML (document order). */
const MATCH_PATH_REGEX =
  /cricket-data-formats\/matches\/[^"'\s>]+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const UUID_TAIL =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function extractMatchIdsFromSeriesHtml(html: string): {
  order: number;
  externalMatchId: string;
  path: string;
}[] {
  const seen = new Set<string>();
  const out: { order: number; externalMatchId: string; path: string }[] = [];
  let m: RegExpExecArray | null;
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

export async function fetchSeriesPageMatchIds(seriesPageUrl: string): Promise<
  { order: number; externalMatchId: string; path: string }[]
> {
  const res = await fetch(seriesPageUrl, {
    headers: {
      "User-Agent":
        "PlayerAuction/1.0 (+https://github.com) series-page-sync",
    },
  });
  if (!res.ok) {
    throw new Error(`Series page fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return extractMatchIdsFromSeriesHtml(html);
}
