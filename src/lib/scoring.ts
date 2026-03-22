import type { ScorecardBatting, ScorecardBowling, ScorecardCatching, ScorecardInnings } from "./cricapi";

export interface ScoringRules {
  batting: {
    perRun: number;
    perFour: number;
    perSix: number;
    halfCentury: number;
    century: number;
    duck: number;
    srBelow60Penalty: number;
    srBelow80Penalty: number;
    srAbove170Bonus: number;
    srAbove200Bonus: number;
    minBallsForSR: number;
  };
  bowling: {
    perWicket: number;
    perMaiden: number;
    fourWickets: number;
    fiveWickets: number;
    ecoBelow4Bonus: number;
    ecoBelow6Bonus: number;
    ecoAbove10Penalty: number;
    ecoAbove12Penalty: number;
    minOversForEco: number;
  };
  fielding: {
    perCatch: number;
    perStumping: number;
    perRunOut: number;
  };
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  batting: {
    perRun: 1,
    perFour: 1,
    perSix: 2,
    halfCentury: 8,
    century: 16,
    duck: -2,
    srBelow60Penalty: -6,
    srBelow80Penalty: -2,
    srAbove170Bonus: 4,
    srAbove200Bonus: 6,
    minBallsForSR: 10,
  },
  bowling: {
    perWicket: 25,
    perMaiden: 8,
    fourWickets: 8,
    fiveWickets: 16,
    ecoBelow4Bonus: 6,
    ecoBelow6Bonus: 4,
    ecoAbove10Penalty: -4,
    ecoAbove12Penalty: -6,
    minOversForEco: 2,
  },
  fielding: {
    perCatch: 8,
    perStumping: 12,
    perRunOut: 6,
  },
};

function mergeRules(overrides: Partial<ScoringRules> | null | undefined): ScoringRules {
  if (!overrides) return DEFAULT_SCORING_RULES;
  return {
    batting: { ...DEFAULT_SCORING_RULES.batting, ...overrides.batting },
    bowling: { ...DEFAULT_SCORING_RULES.bowling, ...overrides.bowling },
    fielding: { ...DEFAULT_SCORING_RULES.fielding, ...overrides.fielding },
  };
}

export interface BattingPoints {
  runs: number;
  fours: number;
  sixes: number;
  milestone: number;
  duck: number;
  srBonus: number;
  total: number;
}

export function calculateBattingPoints(
  batting: ScorecardBatting,
  rules: ScoringRules
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
  const isDuck = batting.r === 0 && batting.b > 0 &&
    batting.dismissal !== "not out" && batting.dismissal !== "";
  if (isDuck) {
    duck = r.duck;
    points += duck;
  }

  let srBonus = 0;
  if (batting.b >= r.minBallsForSR && batting.sr > 0) {
    if (batting.sr >= 200) srBonus = r.srAbove200Bonus;
    else if (batting.sr >= 170) srBonus = r.srAbove170Bonus;
    else if (batting.sr < 60) srBonus = r.srBelow60Penalty;
    else if (batting.sr < 80) srBonus = r.srBelow80Penalty;
    points += srBonus;
  }

  return { runs, fours, sixes, milestone, duck, srBonus, total: points };
}

export interface BowlingPoints {
  wickets: number;
  maidens: number;
  milestone: number;
  ecoBonus: number;
  total: number;
}

export function calculateBowlingPoints(
  bowling: ScorecardBowling,
  rules: ScoringRules
): BowlingPoints {
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
    const eco = bowling.eco;
    if (eco <= 4) ecoBonus = r.ecoBelow4Bonus;
    else if (eco <= 6) ecoBonus = r.ecoBelow6Bonus;
    else if (eco >= 12) ecoBonus = r.ecoAbove12Penalty;
    else if (eco >= 10) ecoBonus = r.ecoAbove10Penalty;
    points += ecoBonus;
  }

  return { wickets, maidens, milestone, ecoBonus, total: points };
}

export interface FieldingPoints {
  catches: number;
  stumpings: number;
  runouts: number;
  total: number;
}

export function calculateFieldingPoints(
  catching: ScorecardCatching,
  rules: ScoringRules
): FieldingPoints {
  const r = rules.fielding;
  const catches = (catching.catch ?? 0) * r.perCatch;
  const stumpings = (catching.stumpinh ?? 0) * r.perStumping;
  const runouts = (catching.runout ?? 0) * r.perRunOut;
  return { catches, stumpings, runouts, total: catches + stumpings + runouts };
}

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
  scoringRulesOverride?: Partial<ScoringRules> | null
): PlayerMatchStats[] {
  const rules = mergeRules(scoringRulesOverride);
  const playerMap = new Map<string, PlayerMatchStats>();

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
      const pts = calculateBattingPoints(bat, rules);
      p.runsScored += bat.r;
      p.ballsFaced += bat.b;
      p.fours += bat["4s"];
      p.sixes += bat["6s"];
      if (bat.dismissal !== "not out" && bat.dismissal !== "") {
        p.isOut = true;
      }
      if (bat.r === 0 && bat.b > 0 && p.isOut) {
        p.isDuck = true;
      }
      p.fantasyPoints += pts.total;
    }

    for (const bowl of innings.bowling) {
      const p = getOrCreate(bowl.bowler.id, bowl.bowler.name);
      const pts = calculateBowlingPoints(bowl, rules);
      p.wicketsTaken += bowl.w;
      p.oversBowled += bowl.o;
      p.runsConceded += bowl.r;
      p.maidens += bowl.m;
      p.dotBalls += bowl["0s"];
      p.fantasyPoints += pts.total;
    }

    for (const cat of innings.catching) {
      const p = getOrCreate(cat.catcher.id, cat.catcher.name);
      const pts = calculateFieldingPoints(cat, rules);
      p.catches += cat.catch ?? 0;
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
