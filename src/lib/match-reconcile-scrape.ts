import { prisma } from "./prisma";

export type ScrapeMatchEntry = { externalMatchId: string };

export type ReconcileScrapeResult = {
  updated: number;
  skipped: number;
  warnings: string[];
};

/**
 * Aligns scrape order to league matches: non-COMPLETED rows sorted by matchDate asc (nulls last),
 * then updates externalMatchId by index. Skips rows with performances unless force.
 */
export async function reconcileMatchesFromScrape(options: {
  leagueId: string;
  matches: ScrapeMatchEntry[];
  force?: boolean;
}): Promise<ReconcileScrapeResult> {
  const { leagueId, matches: scraped, force } = options;
  const warnings: string[] = [];

  if (scraped.length === 0) {
    return { updated: 0, skipped: 0, warnings: ["No scraped matches in body"] };
  }

  const dbRowsRaw = await prisma.leagueMatch.findMany({
    where: {
      leagueId,
      status: { not: "COMPLETED" },
    },
    select: {
      id: true,
      externalMatchId: true,
      matchDate: true,
    },
  });

  const dbRows = dbRowsRaw.sort((a, b) => {
    if (a.matchDate && b.matchDate)
      return a.matchDate.getTime() - b.matchDate.getTime();
    if (a.matchDate) return -1;
    if (b.matchDate) return 1;
    return a.id.localeCompare(b.id);
  });

  const nullDates = dbRows.filter((r) => r.matchDate === null);
  nullDates.forEach(() =>
    warnings.push("Some league matches have no matchDate; order may not match IPL schedule.")
  );

  let updated = 0;
  let skipped = 0;
  const n = Math.min(dbRows.length, scraped.length);
  if (dbRows.length !== scraped.length) {
    warnings.push(
      `Count mismatch: league has ${dbRows.length} open matches, scrape has ${scraped.length}. Reconciled first ${n} pairs only.`
    );
  }

  for (let i = 0; i < n; i++) {
    const row = dbRows[i];
    const ext = scraped[i].externalMatchId.trim().toLowerCase();
    if (!ext) {
      skipped++;
      continue;
    }
    if (row.externalMatchId === ext) {
      skipped++;
      continue;
    }

    const perfCount = await prisma.playerPerformance.count({
      where: { matchId: row.id },
    });
    if (perfCount > 0 && !force) {
      warnings.push(
        `Skipped ${row.id}: already has ${perfCount} performances (use force to overwrite external id)`
      );
      skipped++;
      continue;
    }

    await prisma.leagueMatch.update({
      where: { id: row.id },
      data: { externalMatchId: ext },
    });
    updated++;
  }

  return { updated, skipped, warnings };
}
