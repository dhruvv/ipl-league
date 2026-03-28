import { prisma } from "./prisma";
import { fetchMatchScorecard, fetchMatchPoints } from "./cricapi";
import { calculateMatchFantasyPoints } from "./scoring";
import { scoringEmitter } from "./scoring-events";
import type { ScoringRules } from "./scoring";
import { aggregateFantasyPointsByPlayerId } from "./match-points";

export type ApplyScorecardResult = {
  ok: boolean;
  error?: string;
  performancesUpserted: number;
  matchStatus: string;
  hadScorecardInnings: boolean;
};

/** Upsert PlayerPerformance from CricAPI scorecard (+ match_points when available). Safe to call for LIVE, COMPLETED, or UPCOMING once a scorecard exists. */
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

  let fantasyFromApi: Map<string, number> | null = null;
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
      `[scorecard-import] match_points unavailable for ${ext}, using in-app scoring:`,
      err
    );
  }

  const prevRow = await prisma.leagueMatch.findUnique({
    where: { id: matchId },
    select: { status: true },
  });
  const prevStatus = prevRow?.status;

  let performancesUpserted = 0;

  for (const stat of playerStats) {
    const localPlayerId = externalToLocal.get(stat.externalId.toLowerCase());
    if (!localPlayerId) continue;

    const apiPts = fantasyFromApi?.get(stat.externalId.toLowerCase());
    const fantasyPoints =
      apiPts !== undefined && apiPts !== null ? apiPts : stat.fantasyPoints;

    await prisma.playerPerformance.upsert({
      where: { playerId_matchId: { playerId: localPlayerId, matchId } },
      create: {
        playerId: localPlayerId,
        matchId,
        runsScored: stat.runsScored,
        ballsFaced: stat.ballsFaced,
        fours: stat.fours,
        sixes: stat.sixes,
        wicketsTaken: stat.wicketsTaken,
        oversBowled: stat.oversBowled,
        runsConceded: stat.runsConceded,
        maidens: stat.maidens,
        catches: stat.catches,
        stumpings: stat.stumpings,
        runOuts: stat.runOuts,
        dotBalls: stat.dotBalls,
        strikeRate: stat.strikeRate,
        economyRate: stat.economyRate,
        fantasyPoints,
        isDuck: stat.isDuck,
        isOut: stat.isOut,
      },
      update: {
        runsScored: stat.runsScored,
        ballsFaced: stat.ballsFaced,
        fours: stat.fours,
        sixes: stat.sixes,
        wicketsTaken: stat.wicketsTaken,
        oversBowled: stat.oversBowled,
        runsConceded: stat.runsConceded,
        maidens: stat.maidens,
        catches: stat.catches,
        stumpings: stat.stumpings,
        runOuts: stat.runOuts,
        dotBalls: stat.dotBalls,
        strikeRate: stat.strikeRate,
        economyRate: stat.economyRate,
        fantasyPoints,
        isDuck: stat.isDuck,
        isOut: stat.isOut,
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
    playerCount: playerStats.length,
  });

  return {
    ok: true,
    performancesUpserted,
    matchStatus,
    hadScorecardInnings: true,
  };
}
