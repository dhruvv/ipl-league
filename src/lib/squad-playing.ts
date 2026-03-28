import type { CricApiScorecard } from "./cricapi";

/** Players who appear on the scorecard (batting, bowling, or catching) — proxy for "in the match" after start. */
export function externalIdsSeenInScorecard(sc: CricApiScorecard): Set<string> {
  const s = new Set<string>();
  for (const inn of sc.scorecard ?? []) {
    for (const row of inn.batting ?? []) {
      if (row.batsman?.id) s.add(row.batsman.id.toLowerCase());
    }
    for (const row of inn.bowling ?? []) {
      if (row.bowler?.id) s.add(row.bowler.id.toLowerCase());
    }
    for (const row of inn.catching ?? []) {
      if (row.catcher?.id) s.add(row.catcher.id.toLowerCase());
    }
  }
  return s;
}
