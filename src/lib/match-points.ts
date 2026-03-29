/** CricketData / CricAPI `match_points` response — aggregate to total fantasy points per player id */

export interface MatchPointsInningRow {
  inning: string;
  batting: { name: string; id: string; points: number }[];
  bowling: { name: string; id: string; points: number }[];
  catching: { name: string; id: string; points: number }[];
}

export interface MatchPointsData {
  innings: MatchPointsInningRow[];
}

export function aggregateFantasyPointsByPlayerId(data: MatchPointsData): Map<string, number> {
  const totals = new Map<string, number>();
  for (const inn of data.innings ?? []) {
    const rows = [
      ...(inn.batting ?? []),
      ...(inn.bowling ?? []),
      ...(inn.catching ?? []),
    ];
    for (const row of rows) {
      if (!row) continue;
      const id = row.id;
      if (!id) continue;
      totals.set(id, (totals.get(id) ?? 0) + (row.points ?? 0));
    }
  }
  return totals;
}
