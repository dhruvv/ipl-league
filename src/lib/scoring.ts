import type {
  CricApiScorecard,
  ScorecardBatting,
  ScorecardBowling,
  ScorecardCatching,
  ScorecardInnings,
} from "./cricapi";
import { externalIdsSeenInScorecard } from "./squad-playing";

export interface ScoringRules {
  batting: {
    perRun: number;
    perFour: number;
    perSix: number;
    halfCentury: number;
    century: number;
    duck: number;
    /** SR &lt; 50 */
    srBelow50Penalty: number;
    /** 50 &le; SR &lt; 60 */
    sr50to59Penalty: number;
    /** 60 &le; SR &lt; 70 (60–69.99) */
    sr60to70Penalty: number;
    /** 130 &le; SR &lt; 150 */
    sr130to149Bonus: number;
    /** 150 &le; SR &lt; 170 */
    sr150to169Bonus: number;
    /** SR &ge; 170 */
    sr170PlusBonus: number;
    /** Min balls for SR tiers (non-bowlers only) */
    minBallsForSR: number;
    /** Min runs for SR tiers alternative gate (either this or min balls) */
    minRunsForSR: number;
  };
  bowling: {
    perWicket: number;
    perMaiden: number;
    fourWickets: number;
    fiveWickets: number;
    minOversForEco: number;
    /** economy &lt; 5.00 */
    ecoBelow5Bonus: number;
    /** 5.00 &le; economy &lt; 6.00 */
    eco5to599Bonus: number;
    /** 6.00 &le; economy &lt; 7.00 */
    eco6to699Bonus: number;
    /** 10.00 &le; economy &lt; 11.00 */
    eco10to1099Penalty: number;
    /** 11.00 &le; economy &lt; 12.00 */
    eco11to1199Penalty: number;
    /** economy &ge; 12.00 */
    eco12PlusPenalty: number;
  };
  fielding: {
    perCatch: number;
    perCaughtAndBowled: number;
    perStumping: number;
    perRunOut: number;
    /** One-time bonus when this player’s total catches in the match ≥ 3 (incl. C&B in tally). */
    threeCatchesBonus: number;
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
    sr130to149Bonus: 2,
    sr150to169Bonus: 4,
    sr170PlusBonus: 6,
    minBallsForSR: 10,
    minRunsForSR: 20,
  },
  bowling: {
    perWicket: 25,
    perMaiden: 8,
    fourWickets: 8,
    fiveWickets: 16,
    minOversForEco: 2,
    ecoBelow5Bonus: 6,
    eco5to599Bonus: 4,
    eco6to699Bonus: 2,
    eco10to1099Penalty: -2,
    eco11to1199Penalty: -4,
    eco12PlusPenalty: -6,
  },
  fielding: {
    perCatch: 8,
    perCaughtAndBowled: 33,
    perStumping: 12,
    perRunOut: 8,
    threeCatchesBonus: 4,
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
  if (m.sr130to149Bonus === undefined && o.srAbove130Bonus !== undefined) {
    m.sr130to149Bonus = Number(o.srAbove130Bonus);
  }
  if (m.sr150to169Bonus === undefined && o.srAbove150Bonus !== undefined) {
    m.sr150to169Bonus = Number(o.srAbove150Bonus);
  }
  if (m.sr170PlusBonus === undefined && o.srAbove170Bonus !== undefined) {
    m.sr170PlusBonus = Number(o.srAbove170Bonus);
  }
  delete m.srAbove130Bonus;
  delete m.srAbove150Bonus;
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
  const m: Record<string, unknown> = { ...base, ...overrides };
  if (m.ecoBelow5Bonus === undefined && o.ecoBelow4Bonus !== undefined) {
    m.ecoBelow5Bonus = Number(o.ecoBelow4Bonus);
  }
  if (m.eco5to599Bonus === undefined && o.eco4to5Bonus !== undefined) {
    m.eco5to599Bonus = Number(o.eco4to5Bonus);
  }
  if (m.eco6to699Bonus === undefined && o.eco5to6Bonus !== undefined) {
    m.eco6to699Bonus = Number(o.eco5to6Bonus);
  }
  if (m.eco10to1099Penalty === undefined && o.eco9to10Penalty !== undefined) {
    m.eco10to1099Penalty = Number(o.eco9to10Penalty);
  }
  if (m.eco11to1199Penalty === undefined && o.eco10_01to11Penalty !== undefined) {
    m.eco11to1199Penalty = Number(o.eco10_01to11Penalty);
  }
  if (m.eco12PlusPenalty === undefined && o.ecoAbove11Penalty !== undefined) {
    m.eco12PlusPenalty = Number(o.ecoAbove11Penalty);
  }
  delete m.ecoBelow4Bonus;
  delete m.eco4to5Bonus;
  delete m.eco5to6Bonus;
  delete m.eco9to10Penalty;
  delete m.eco10_01to11Penalty;
  delete m.ecoAbove11Penalty;
  return m as ScoringRules["bowling"];
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

/** Strike-rate penalty and bonus tiers use official table for non-bowlers only. */
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
  /** Slow SR (&lt; 70); non-positive */
  srPenalty: number;
  /** Fast SR (&ge; 130); non-negative */
  srBonus: number;
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
  let srBonus = 0;
  const balls = typeof batting.b === "number" && Number.isFinite(batting.b) ? batting.b : 0;
  const runsBat = typeof batting.r === "number" && Number.isFinite(batting.r) ? batting.r : 0;
  const minRuns = r.minRunsForSR ?? DEFAULT_SCORING_RULES.batting.minRunsForSR;
  const srQualifies =
    (balls >= r.minBallsForSR || runsBat >= minRuns) &&
    batting.sr > 0 &&
    strikeRatePenaltyApplies(options?.leaguePosition);

  if (srQualifies) {
    const sr = batting.sr;
    if (sr < 50) srPenalty = r.srBelow50Penalty;
    else if (sr < 60) srPenalty = r.sr50to59Penalty;
    else if (sr < 70) srPenalty = r.sr60to70Penalty;
    else if (sr < 130) {
      /* neutral */
    } else if (sr < 150) srBonus = r.sr130to149Bonus;
    else if (sr < 170) srBonus = r.sr150to169Bonus;
    else srBonus = r.sr170PlusBonus;
    points += srPenalty + srBonus;
  }

  return { runs, fours, sixes, milestone, duck, srPenalty, srBonus, total: points };
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
    if (e >= 12) ecoBonus = r.eco12PlusPenalty;
    else if (e >= 11) ecoBonus = r.eco11to1199Penalty;
    else if (e >= 10) ecoBonus = r.eco10to1099Penalty;
    else if (e >= 7) ecoBonus = 0;
    else if (e >= 6) ecoBonus = r.eco6to699Bonus;
    else if (e >= 5) ecoBonus = r.eco5to599Bonus;
    else ecoBonus = r.ecoBelow5Bonus;
  }
  points += ecoBonus;

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
    for (const bat of innings.batting ?? []) {
      const batsman = bat?.batsman;
      const bid = batsman?.id?.trim();
      if (!bid) continue;
      const p = getOrCreate(bid, batsman?.name ?? "Unknown");
      const pts = calculateBattingPoints(bat, rules, {
        leaguePosition: metaFor(bid).leaguePosition,
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
        duckPenaltyApplies(metaFor(bid).leaguePosition)
      ) {
        p.isDuck = true;
      }
      p.fantasyPoints += pts.total;
    }

    for (const bowl of innings.bowling ?? []) {
      const bowler = bowl?.bowler;
      const boid = bowler?.id?.trim();
      if (!boid) continue;
      const p = getOrCreate(boid, bowler?.name ?? "Unknown");
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

    for (const cat of innings.catching ?? []) {
      const catcher = cat?.catcher;
      const cid = catcher?.id?.trim();
      if (!cid) continue;
      const p = getOrCreate(cid, catcher?.name ?? "Unknown");
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

  const tc = rules.fielding.threeCatchesBonus;
  if (tc !== 0) {
    for (const p of playerMap.values()) {
      if (p.catches >= 3) {
        p.fantasyPoints += tc;
      }
    }
  }

  return [...playerMap.values()];
}

export interface BattingBreakdownRow {
  inning: string;
  name: string;
  breakdown: BattingPoints;
  r: number;
  b: number;
  fours: number;
  sixes: number;
  sr: number;
  dismissal: string;
}

export interface BowlingBreakdownRow {
  inning: string;
  name: string;
  breakdown: BowlingPoints;
  o: number;
  m: number;
  r: number;
  w: number;
  eco: number;
}

export interface FieldingBreakdownRow {
  inning: string;
  name: string;
  breakdown: FieldingPoints;
  catch: number;
  cb: number;
  stumpings: number;
  runouts: number;
}

/** Line-by-line local fantasy math for one player from the scorecard (for audit UI). */
export function buildPlayerFantasyBreakdown(
  scorecard: ScorecardInnings[],
  externalIdLower: string,
  rules: ScoringRules,
  leaguePosition: string | null | undefined
): {
  batting: BattingBreakdownRow[];
  bowling: BowlingBreakdownRow[];
  fielding: FieldingBreakdownRow[];
  localSubtotal: number;
  appearsOnScorecard: boolean;
  playingXiPointsAwarded: number;
  threeCatchBonusAwarded: number;
  totalCatchesInMatch: number;
} {
  const ext = externalIdLower.trim().toLowerCase();
  const batting: BattingBreakdownRow[] = [];
  const bowling: BowlingBreakdownRow[] = [];
  const fielding: FieldingBreakdownRow[] = [];
  let localSubtotal = 0;
  let totalCatchesInMatch = 0;

  for (const innings of scorecard) {
    const inname =
      typeof innings.inning === "string" ? innings.inning : "Innings";

    for (const bat of innings.batting ?? []) {
      const batsman = bat?.batsman;
      const bid = batsman?.id?.trim().toLowerCase();
      if (!bid || bid !== ext) continue;
      const breakdown = calculateBattingPoints(bat, rules, {
        leaguePosition,
      });
      localSubtotal += breakdown.total;
      const f4 = bat["4s"];
      const f6 = bat["6s"];
      batting.push({
        inning: inname,
        name: batsman?.name ?? "Unknown",
        breakdown,
        r: typeof bat.r === "number" && Number.isFinite(bat.r) ? bat.r : 0,
        b: typeof bat.b === "number" && Number.isFinite(bat.b) ? bat.b : 0,
        fours: typeof f4 === "number" && Number.isFinite(f4) ? f4 : 0,
        sixes: typeof f6 === "number" && Number.isFinite(f6) ? f6 : 0,
        sr: typeof bat.sr === "number" && Number.isFinite(bat.sr) ? bat.sr : 0,
        dismissal: bat.dismissal ?? "",
      });
    }

    for (const bowl of innings.bowling ?? []) {
      const bowler = bowl?.bowler;
      const boid = bowler?.id?.trim().toLowerCase();
      if (!boid || boid !== ext) continue;
      const breakdown = calculateBowlingPoints(bowl, rules);
      localSubtotal += breakdown.total;
      bowling.push({
        inning: inname,
        name: bowler?.name ?? "Unknown",
        breakdown,
        o: typeof bowl.o === "number" && Number.isFinite(bowl.o) ? bowl.o : 0,
        m: typeof bowl.m === "number" && Number.isFinite(bowl.m) ? bowl.m : 0,
        r: typeof bowl.r === "number" && Number.isFinite(bowl.r) ? bowl.r : 0,
        w: typeof bowl.w === "number" && Number.isFinite(bowl.w) ? bowl.w : 0,
        eco: typeof bowl.eco === "number" && Number.isFinite(bowl.eco)
          ? bowl.eco
          : 0,
      });
    }

    for (const cat of innings.catching ?? []) {
      const catcher = cat?.catcher;
      const cid = catcher?.id?.trim().toLowerCase();
      if (!cid || cid !== ext) continue;
      const breakdown = calculateFieldingPoints(cat, rules);
      localSubtotal += breakdown.total;
      const cb = cat.cb ?? 0;
      const catchTotal = cat.catch ?? 0;
      totalCatchesInMatch += Math.max(0, catchTotal - cb) + cb;
      fielding.push({
        inning: inname,
        name: catcher?.name ?? "Unknown",
        breakdown,
        catch: catchTotal,
        cb,
        stumpings: cat.stumpinh ?? 0,
        runouts: cat.runout ?? 0,
      });
    }
  }

  const threeCatchBonusAwarded =
    rules.fielding.threeCatchesBonus !== 0 && totalCatchesInMatch >= 3
      ? rules.fielding.threeCatchesBonus
      : 0;
  localSubtotal += threeCatchBonusAwarded;

  const appearsOnScorecard = externalIdsSeenInScorecard({
    scorecard,
  } as CricApiScorecard).has(ext);

  const playingXiPointsAwarded =
    rules.playingXiPoints !== 0 && appearsOnScorecard
      ? rules.playingXiPoints
      : 0;

  return {
    batting,
    bowling,
    fielding,
    localSubtotal,
    appearsOnScorecard,
    playingXiPointsAwarded,
    threeCatchBonusAwarded,
    totalCatchesInMatch,
  };
}
