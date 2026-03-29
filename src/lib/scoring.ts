import type {
  ScorecardBatting,
  ScorecardBowling,
  ScorecardCatching,
  ScorecardInnings,
} from "./cricapi";

export interface ScoringRules {
  batting: {
    perRun: number;
    perFour: number;
    perSix: number;
    halfCentury: number;
    century: number;
    duck: number;
    /** SR &lt; 50 (min balls applies) */
    srBelow50Penalty: number;
    /** 50 &le; SR &le; 59.99 */
    sr50to59Penalty: number;
    /** 60 &lt; SR &le; 70 */
    sr60to70Penalty: number;
    minBallsForSR: number;
  };
  bowling: {
    perWicket: number;
    perMaiden: number;
    fourWickets: number;
    fiveWickets: number;
    minOversForEco: number;
    ecoBelow4Bonus: number;
    /** inclusive 4, exclusive 5 */
    eco4to5Bonus: number;
    /** inclusive 5 and 6 */
    eco5to6Bonus: number;
    /** inclusive 9 and 10 */
    eco9to10Penalty: number;
    /** 10.01 through 11 inclusive */
    eco10_01to11Penalty: number;
    /** strictly above 11 */
    ecoAbove11Penalty: number;
  };
  fielding: {
    perCatch: number;
    perCaughtAndBowled: number;
    perStumping: number;
    perRunOut: number;
  };
  /**
   * CricAPI has no reliable “playing XI” flag; we award this once per player who appears
   * on the scorecard (batting, bowling, or fielding). Set 0 to disable.
   */
  playingXiPoints: number;
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  batting: {
    perRun: 1,
    perFour: 1,
    perSix: 2,
    halfCentury: 8,
    century: 16,
    duck: -2,
    srBelow50Penalty: -6,
    sr50to59Penalty: -4,
    sr60to70Penalty: -2,
    minBallsForSR: 10,
  },
  bowling: {
    perWicket: 25,
    perMaiden: 8,
    fourWickets: 8,
    fiveWickets: 16,
    minOversForEco: 2,
    ecoBelow4Bonus: 6,
    eco4to5Bonus: 4,
    eco5to6Bonus: 2,
    eco9to10Penalty: -2,
    eco10_01to11Penalty: -4,
    ecoAbove11Penalty: -6,
  },
  fielding: {
    perCatch: 8,
    perCaughtAndBowled: 33,
    perStumping: 12,
    perRunOut: 6,
  },
  playingXiPoints: 4,
};

function mergeBatting(
  overrides?: Partial<ScoringRules["batting"]> & Record<string, unknown>
): ScoringRules["batting"] {
  const base = { ...DEFAULT_SCORING_RULES.batting };
  if (!overrides) return base;
  const o = overrides as Record<string, unknown>;
  const m: Record<string, unknown> = { ...base, ...overrides };
  if (m.sr60to70Penalty === undefined && o.srBelow60Penalty !== undefined) {
    m.sr60to70Penalty = o.srBelow60Penalty;
  }
  if (m.sr50to59Penalty === undefined && o.srBelow80Penalty !== undefined) {
    m.sr50to59Penalty = o.srBelow80Penalty;
  }
  delete m.srBelow60Penalty;
  delete m.srBelow80Penalty;
  delete m.srAbove170Bonus;
  delete m.srAbove200Bonus;
  return m as ScoringRules["batting"];
}

function mergeBowling(
  overrides?: Partial<ScoringRules["bowling"]> & Record<string, unknown>
): ScoringRules["bowling"] {
  const base = { ...DEFAULT_SCORING_RULES.bowling };
  if (!overrides) return base;
  const o = { ...overrides } as Record<string, unknown>;
  delete o.ecoBelow6Bonus;
  delete o.ecoAbove10Penalty;
  delete o.ecoAbove12Penalty;
  return { ...base, ...o } as ScoringRules["bowling"];
}

function mergeFielding(
  overrides?: Partial<ScoringRules["fielding"]> & Record<string, unknown>
): ScoringRules["fielding"] {
  const base = { ...DEFAULT_SCORING_RULES.fielding };
  if (!overrides) return base;
  const o = overrides as Record<string, unknown>;
  const m: Record<string, unknown> = { ...base, ...overrides };
  if (m.perCaughtAndBowled === undefined && o.perCaughtBowled !== undefined) {
    m.perCaughtAndBowled = o.perCaughtBowled;
  }
  return m as ScoringRules["fielding"];
}

/** Full rules including defaults (for addons like playing XI outside scorecard totals). */
export function mergeScoringRules(
  overrides: Partial<ScoringRules> | null | undefined
): ScoringRules {
  return mergeRules(overrides);
}

function mergeRules(overrides: Partial<ScoringRules> | null | undefined): ScoringRules {
  if (!overrides) return DEFAULT_SCORING_RULES;
  const base = DEFAULT_SCORING_RULES;
  const xi =
    overrides.playingXiPoints !== undefined && overrides.playingXiPoints !== null
      ? Number(overrides.playingXiPoints)
      : base.playingXiPoints;
  return {
    batting: mergeBatting(
      overrides.batting as Partial<ScoringRules["batting"]> & Record<string, unknown>
    ),
    bowling: mergeBowling(
      overrides.bowling as Partial<ScoringRules["bowling"]> & Record<string, unknown>
    ),
    fielding: mergeFielding(
      overrides.fielding as Partial<ScoringRules["fielding"]> & Record<string, unknown>
    ),
    playingXiPoints: Number.isFinite(xi) ? xi : base.playingXiPoints,
  };
}

/** Duck penalty applies to batsmen, keepers, all-rounders — not pure bowlers. */
export function duckPenaltyApplies(leaguePosition: string | null | undefined): boolean {
  if (!leaguePosition?.trim()) return true;
  const n = leaguePosition.toLowerCase();
  if (n.includes("all")) return true;
  if (n.includes("wicket") || n.includes("keeper") || /\bwk\b/.test(n)) return true;
  if (n.includes("bat") || n.includes("batsman")) return true;
  if (n.includes("bowl") && !n.includes("all")) return false;
  return true;
}

/** Strike-rate penalties use official table for non-bowlers only. */
export function strikeRatePenaltyApplies(leaguePosition: string | null | undefined): boolean {
  if (!leaguePosition?.trim()) return true;
  const n = leaguePosition.toLowerCase();
  if (n.includes("all")) return true;
  if (n.includes("bowl") && !n.includes("all")) return false;
  return true;
}

export interface BattingPoints {
  runs: number;
  fours: number;
  sixes: number;
  milestone: number;
  duck: number;
  srPenalty: number;
  total: number;
}

export function calculateBattingPoints(
  batting: ScorecardBatting,
  rules: ScoringRules,
  options?: { leaguePosition?: string | null }
): BattingPoints {
  const r = rules.batting;
  let points = 0;

  const runs = batting.r * r.perRun;
  const fours = batting["4s"] * r.perFour;
  const sixes = batting["6s"] * r.perSix;
  points += runs + fours + sixes;

  let milestone = 0;
  if (batting.r >= 100) milestone = r.century;
  else if (batting.r >= 50) milestone = r.halfCentury;
  points += milestone;

  let duck = 0;
  const isDuck =
    batting.r === 0 &&
    batting.b > 0 &&
    batting.dismissal !== "not out" &&
    batting.dismissal !== "";
  if (isDuck && duckPenaltyApplies(options?.leaguePosition)) {
    duck = r.duck;
    points += duck;
  }

  let srPenalty = 0;
  if (
    batting.b >= r.minBallsForSR &&
    batting.sr > 0 &&
    strikeRatePenaltyApplies(options?.leaguePosition)
  ) {
    const sr = batting.sr;
    if (sr < 50) srPenalty = r.srBelow50Penalty;
    else if (sr < 60) srPenalty = r.sr50to59Penalty;
    else if (sr <= 70) srPenalty = r.sr60to70Penalty;
    points += srPenalty;
  }

  return { runs, fours, sixes, milestone, duck, srPenalty, total: points };
}

export interface BowlingPoints {
  wickets: number;
  maidens: number;
  milestone: number;
  ecoBonus: number;
  total: number;
}

export function calculateBowlingPoints(bowling: ScorecardBowling, rules: ScoringRules): BowlingPoints {
  const r = rules.bowling;
  let points = 0;

  const wickets = bowling.w * r.perWicket;
  const maidens = bowling.m * r.perMaiden;
  points += wickets + maidens;

  let milestone = 0;
  if (bowling.w >= 5) milestone = r.fiveWickets;
  else if (bowling.w >= 4) milestone = r.fourWickets;
  points += milestone;

  let ecoBonus = 0;
  if (bowling.o >= r.minOversForEco) {
    const e = bowling.eco;
    if (e > 11) ecoBonus = r.ecoAbove11Penalty;
    else if (e >= 10.01 && e <= 11) ecoBonus = r.eco10_01to11Penalty;
    else if (e >= 9 && e <= 10) ecoBonus = r.eco9to10Penalty;
    else if (e > 6 && e < 9) ecoBonus = 0;
    else if (e >= 5 && e <= 6) ecoBonus = r.eco5to6Bonus;
    else if (e >= 4 && e < 5) ecoBonus = r.eco4to5Bonus;
    else if (e < 4) ecoBonus = r.ecoBelow4Bonus;
    else ecoBonus = 0;
  }

  return { wickets, maidens, milestone, ecoBonus, total: points };
}

export interface FieldingPoints {
  catches: number;
  caughtAndBowled: number;
  stumpings: number;
  runouts: number;
  total: number;
}

export function calculateFieldingPoints(
  catching: ScorecardCatching,
  rules: ScoringRules
): FieldingPoints {
  const r = rules.fielding;
  const cb = catching.cb ?? 0;
  const catchTotal = catching.catch ?? 0;
  const regularCatches = Math.max(0, catchTotal - cb);
  const catchesPts = regularCatches * r.perCatch + cb * r.perCaughtAndBowled;
  const stumpings = (catching.stumpinh ?? 0) * r.perStumping;
  const runouts = (catching.runout ?? 0) * r.perRunOut;
  return {
    catches: catchesPts,
    caughtAndBowled: cb * r.perCaughtAndBowled,
    stumpings,
    runouts,
    total: catchesPts + stumpings + runouts,
  };
}

export type PlayerMetaByExternalId = Map<
  string,
  { position?: string | null }
>;

export interface PlayerMatchStats {
  externalId: string;
  name: string;
  runsScored: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  wicketsTaken: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  economyRate: number;
  dotBalls: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  isDuck: boolean;
  isOut: boolean;
  fantasyPoints: number;
}

export function calculateMatchFantasyPoints(
  scorecard: ScorecardInnings[],
  scoringRulesOverride?: Partial<ScoringRules> | null,
  playerMetaByExternalId?: PlayerMetaByExternalId | null
): PlayerMatchStats[] {
  const rules = mergeRules(scoringRulesOverride);
  const playerMap = new Map<string, PlayerMatchStats>();

  function metaFor(externalId: string): { leaguePosition?: string | null } {
    const id = externalId.toLowerCase();
    const row = playerMetaByExternalId?.get(id);
    return { leaguePosition: row?.position ?? null };
  }

  function getOrCreate(id: string, name: string): PlayerMatchStats {
    if (!playerMap.has(id)) {
      playerMap.set(id, {
        externalId: id,
        name,
        runsScored: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        wicketsTaken: 0,
        oversBowled: 0,
        runsConceded: 0,
        maidens: 0,
        economyRate: 0,
        dotBalls: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        isDuck: false,
        isOut: false,
        fantasyPoints: 0,
      });
    }
    return playerMap.get(id)!;
  }

  for (const innings of scorecard) {
    for (const bat of innings.batting) {
      const p = getOrCreate(bat.batsman.id, bat.batsman.name);
      const pts = calculateBattingPoints(bat, rules, {
        leaguePosition: metaFor(bat.batsman.id).leaguePosition,
      });
      p.runsScored += typeof bat.r === "number" && Number.isFinite(bat.r) ? bat.r : 0;
      p.ballsFaced += typeof bat.b === "number" && Number.isFinite(bat.b) ? bat.b : 0;
      const f4 = bat["4s"];
      const f6 = bat["6s"];
      p.fours += typeof f4 === "number" && Number.isFinite(f4) ? f4 : 0;
      p.sixes += typeof f6 === "number" && Number.isFinite(f6) ? f6 : 0;
      if (bat.dismissal !== "not out" && bat.dismissal !== "") {
        p.isOut = true;
      }
      if (
        bat.r === 0 &&
        bat.b > 0 &&
        p.isOut &&
        duckPenaltyApplies(metaFor(bat.batsman.id).leaguePosition)
      ) {
        p.isDuck = true;
      }
      p.fantasyPoints += pts.total;
    }

    for (const bowl of innings.bowling) {
      const p = getOrCreate(bowl.bowler.id, bowl.bowler.name);
      const pts = calculateBowlingPoints(bowl, rules);
      p.wicketsTaken +=
        typeof bowl.w === "number" && Number.isFinite(bowl.w) ? bowl.w : 0;
      p.oversBowled +=
        typeof bowl.o === "number" && Number.isFinite(bowl.o) ? bowl.o : 0;
      p.runsConceded +=
        typeof bowl.r === "number" && Number.isFinite(bowl.r) ? bowl.r : 0;
      p.maidens +=
        typeof bowl.m === "number" && Number.isFinite(bowl.m) ? bowl.m : 0;
      const z = bowl["0s"];
      p.dotBalls += typeof z === "number" && Number.isFinite(z) ? z : 0;
      p.fantasyPoints += pts.total;
    }

    for (const cat of innings.catching) {
      const p = getOrCreate(cat.catcher.id, cat.catcher.name);
      const pts = calculateFieldingPoints(cat, rules);
      const cb = cat.cb ?? 0;
      const catchTotal = cat.catch ?? 0;
      p.catches += Math.max(0, catchTotal - cb) + cb;
      p.stumpings += cat.stumpinh ?? 0;
      p.runOuts += cat.runout ?? 0;
      p.fantasyPoints += pts.total;
    }
  }

  for (const p of playerMap.values()) {
    p.strikeRate = p.ballsFaced > 0 ? (p.runsScored / p.ballsFaced) * 100 : 0;
    p.economyRate = p.oversBowled > 0 ? p.runsConceded / p.oversBowled : 0;
  }

  return [...playerMap.values()];
}
