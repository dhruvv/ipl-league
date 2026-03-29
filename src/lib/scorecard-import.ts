import { prisma } from "./prisma";
import type { CricApiScorecard } from "./cricapi";
import { fetchMatchScorecard, fetchMatchPoints } from "./cricapi";
import {
  calculateMatchFantasyPoints,
  mergeScoringRules,
} from "./scoring";
import { scoringEmitter } from "./scoring-events";
import type { PlayerMatchStats, ScoringRules } from "./scoring";
import { aggregateFantasyPointsByPlayerId } from "./match-points";
import { externalIdsSeenInScorecard } from "./squad-playing";

function safeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(
    Math.max(-2_147_483_648, Math.min(2_147_483_647, n))
  );
}

function safeFloat(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function emptyPlayerMatchStats(externalId: string): PlayerMatchStats {
  return {
    externalId,
    name: "",
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
  };
}

function prismaPerformanceScalars(stat: PlayerMatchStats, fantasyPoints: number) {
  return {
    runsScored: safeInt(stat.runsScored),
    ballsFaced: safeInt(stat.ballsFaced),
    fours: safeInt(stat.fours),
    sixes: safeInt(stat.sixes),
    wicketsTaken: safeInt(stat.wicketsTaken),
    oversBowled: safeFloat(stat.oversBowled),
    runsConceded: safeInt(stat.runsConceded),
    maidens: safeInt(stat.maidens),
    catches: safeInt(stat.catches),
    stumpings: safeInt(stat.stumpings),
    runOuts: safeInt(stat.runOuts),
    dotBalls: safeInt(stat.dotBalls),
    strikeRate: safeFloat(stat.strikeRate),
    economyRate: safeFloat(stat.economyRate),
    fantasyPoints: safeFloat(fantasyPoints),
    isDuck: Boolean(stat.isDuck),
    isOut: Boolean(stat.isOut),
  };
}

export type ApplyScorecardResult = {
  ok: boolean;
  error?: string;
  performancesUpserted: number;
  matchStatus: string;
  hadScorecardInnings: boolean;
};

/** Upsert PlayerPerformance: CricAPI match_points when available (ball-by-ball), else scorecard-based local math; always adds local-only bonuses (e.g. playing XI). */
export async function applyScorecardToLeagueMatch(params: {
  leagueId: string;
  matchId: string;
  externalMatchId: string;
  scoringRulesOverride: Partial<ScoringRules> | null;
  cricapiFantasyRulesetId: string | null;
}): Promise<ApplyScorecardResult> {
  const {
    leagueId,
    matchId,
    externalMatchId,
    scoringRulesOverride,
    cricapiFantasyRulesetId,
  } = params;

  const ext = externalMatchId.trim();
  if (!ext) {
    return {
      ok: false,
      error: "externalMatchId is empty",
      performancesUpserted: 0,
      matchStatus: "",
      hadScorecardInnings: false,
    };
  }

  const scorecard = await fetchMatchScorecard(ext);
  const isCompleted = Boolean(
    scorecard.matchWinner && scorecard.matchWinner !== ""
  );

  if (!scorecard.scorecard || scorecard.scorecard.length === 0) {
    const row = await prisma.leagueMatch.findUnique({
      where: { id: matchId },
      select: { status: true },
    });
    return {
      ok: true,
      performancesUpserted: 0,
      matchStatus: row?.status ?? "",
      hadScorecardInnings: false,
    };
  }

  const mappedPlayers = await prisma.player.findMany({
    where: { league: { id: leagueId }, externalId: { not: null } },
    select: { id: true, externalId: true, position: true },
  });

  const externalToLocal = new Map(
    mappedPlayers
      .filter((p) => p.externalId)
      .map((p) => [p.externalId!.toLowerCase(), p.id])
  );

  const rules = mergeScoringRules(scoringRulesOverride);
  const onCard = externalIdsSeenInScorecard(scorecard as CricApiScorecard);

  const playerMetaByExternalId = new Map<
    string,
    { position?: string | null }
  >(
    mappedPlayers
      .filter((p) => p.externalId)
      .map((p) => [
        p.externalId!.toLowerCase(),
        { position: p.position },
      ])
  );

  const playerStats = calculateMatchFantasyPoints(
    scorecard.scorecard,
    scoringRulesOverride,
    playerMetaByExternalId
  );

  const localOnly = process.env.FANTASY_POINTS_LOCAL_ONLY?.trim() === "true";

  let fantasyFromApi: Map<string, number> | null = null;
  if (!localOnly && process.env.CRICAPI_KEY) {
    try {
      const mp = await fetchMatchPoints(ext, {
        rulesetId: cricapiFantasyRulesetId,
      });
      const raw = aggregateFantasyPointsByPlayerId(mp);
      fantasyFromApi = new Map(
        [...raw.entries()].map(([k, v]) => [k.toLowerCase(), v])
      );
    } catch (err) {
      console.warn(
        `[scorecard-import] match_points unavailable for ${ext}, using scorecard totals:`,
        err
      );
    }
  }

  const prevRow = await prisma.leagueMatch.findUnique({
    where: { id: matchId },
    select: { status: true },
  });
  const prevStatus = prevRow?.status;

  const statByExt = new Map<string, PlayerMatchStats>(
    playerStats.map((s) => [s.externalId.toLowerCase(), s])
  );

  const mergedIds = new Set<string>();
  for (const s of playerStats) mergedIds.add(s.externalId.toLowerCase());
  if (fantasyFromApi) {
    for (const k of fantasyFromApi.keys()) {
      if (externalToLocal.has(k)) mergedIds.add(k);
    }
  }

  let performancesUpserted = 0;

  for (const extLower of mergedIds) {
    const localPlayerId = externalToLocal.get(extLower);
    if (!localPlayerId) continue;

    const stat = statByExt.get(extLower) ?? emptyPlayerMatchStats(extLower);

    const apiPts = fantasyFromApi?.get(extLower);
    const useApi =
      !localOnly &&
      apiPts !== undefined &&
      apiPts !== null &&
      Number.isFinite(apiPts);

    const xiAdd =
      rules.playingXiPoints !== 0 && onCard.has(extLower)
        ? rules.playingXiPoints
        : 0;

    const fantasyPoints = useApi
      ? safeFloat(apiPts!) + xiAdd
      : safeFloat(stat.fantasyPoints) + xiAdd;

    const cols = prismaPerformanceScalars(stat, fantasyPoints);

    await prisma.playerPerformance.upsert({
      where: { playerId_matchId: { playerId: localPlayerId, matchId } },
      create: {
        playerId: localPlayerId,
        matchId,
        ...cols,
      },
      update: {
        ...cols,
      },
    });
    performancesUpserted++;
  }

  let nextStatus: "UPCOMING" | "LIVE" | "COMPLETED";
  if (isCompleted) {
    nextStatus = "COMPLETED";
  } else if (prevStatus === "COMPLETED") {
    nextStatus = "COMPLETED";
  } else {
    nextStatus = "LIVE";
  }

  await prisma.leagueMatch.update({
    where: { id: matchId },
    data: { status: nextStatus },
  });
  const matchStatus = nextStatus;

  if (nextStatus === "COMPLETED" && prevStatus !== "COMPLETED") {
    scoringEmitter.emit(leagueId, "match-completed", {
      matchId,
      externalMatchId: ext,
    });
  }

  scoringEmitter.emit(leagueId, "score-update", {
    matchId,
    externalMatchId: ext,
    playerCount: mergedIds.size,
  });

  return {
    ok: true,
    performancesUpserted,
    matchStatus,
    hadScorecardInnings: true,
  };
}
