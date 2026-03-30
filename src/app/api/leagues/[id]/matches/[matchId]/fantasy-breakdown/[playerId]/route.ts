import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";
import type { ScorecardInnings } from "@/lib/cricapi";
import { fetchMatchScorecard, fetchMatchPoints } from "@/lib/cricapi";
import { aggregateFantasyPointsByPlayerId } from "@/lib/match-points";
import {
  buildPlayerFantasyBreakdown,
  mergeScoringRules,
  type ScoringRules,
} from "@/lib/scoring";
import { computeAutoFantasyBaseForPlayer } from "@/lib/scorecard-import";

/**
 * How fantasy points were derived for one player in one match (scorecard breakdown + API total).
 * Not linked from main nav; for league members who know the URL.
 */
export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; matchId: string; playerId: string }>;
  }
) {
  try {
    const { id: leagueId, matchId, playerId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const viewerIsAdmin =
      member.role === "OWNER" || member.role === "ADMIN";

    const [league, match, player] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          scoringRules: true,
          cricapiFantasyRulesetId: true,
          name: true,
        },
      }),
      prisma.leagueMatch.findFirst({
        where: { id: matchId, leagueId },
        select: {
          id: true,
          externalMatchId: true,
          team1: true,
          team2: true,
          status: true,
          matchDate: true,
        },
      }),
      prisma.player.findFirst({
        where: { id: playerId, leagueId },
        select: {
          id: true,
          name: true,
          position: true,
          externalId: true,
        },
      }),
    ]);

    if (!league || !match || !player) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = player.externalId?.trim().toLowerCase();
    const rules = mergeScoringRules(
      league.scoringRules as Partial<ScoringRules> | null
    );

    const perf = await prisma.playerPerformance.findUnique({
      where: { playerId_matchId: { playerId, matchId } },
      select: {
        fantasyPoints: true,
        adminFantasyAdjustment: true,
        runsScored: true,
        ballsFaced: true,
        fours: true,
        sixes: true,
        wicketsTaken: true,
        oversBowled: true,
        runsConceded: true,
        maidens: true,
        catches: true,
        stumpings: true,
        runOuts: true,
        dotBalls: true,
        strikeRate: true,
        economyRate: true,
        isDuck: true,
        isOut: true,
      },
    });

    const storedFantasyPoints = perf
      ? Math.round(perf.fantasyPoints * 100) / 100
      : null;

    const notes: string[] = [];

    const emptyComposition = {
      mode: "unknown" as "match_points_plus_xi" | "local_scorecard_plus_xi" | "unknown",
      cricketDataMatchPoints: null as number | null,
      cricketDataCountsTowardStored: false,
      appPlayingXiBonus: 0,
      appLocalRulesSubtotal: 0,
      referenceBreakdownCaption:
        "Line items apply your merged league rules to the CricAPI scorecard.",
    };

    const emptyPayload = {
      leagueName: league.name,
      match: {
        id: match.id,
        team1: match.team1,
        team2: match.team2,
        status: match.status,
        matchDate: match.matchDate,
      },
      player: {
        id: player.id,
        name: player.name,
        position: player.position,
        externalId: player.externalId,
      },
      storedFantasyPoints,
      cricapiMatchPointsTotal: null as number | null,
      localSubtotal: 0,
      playingXiPointsAwarded: 0,
      explainedTotal: 0,
      usesCricApiEngine: false,
      composition: emptyComposition,
      batting: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["batting"],
      bowling: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["bowling"],
      fielding: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["fielding"],
      threeCatchBonusAwarded: 0,
      totalCatchesInMatch: 0,
      notes,
      viewerIsAdmin,
      adminPerformance: null,
    };

    if (!process.env.CRICAPI_KEY) {
      notes.push("CRICAPI_KEY is not set — cannot load scorecard or match_points.");
      return NextResponse.json(emptyPayload);
    }

    if (!ext) {
      notes.push("Map this player to a CricAPI id to see a scorecard breakdown.");
      return NextResponse.json(emptyPayload);
    }

    const trimmedExt = match.externalMatchId?.trim();
    if (!trimmedExt) {
      notes.push("Set externalMatchId on this league match first.");
      return NextResponse.json(emptyPayload);
    }

    let scorecardInnings: ScorecardInnings[] = [];
    try {
      const sc = await fetchMatchScorecard(trimmedExt);
      scorecardInnings = sc.scorecard ?? [];
    } catch {
      notes.push("Could not load match_scorecard from CricAPI.");
    }

    const breakdown =
      scorecardInnings.length > 0
        ? buildPlayerFantasyBreakdown(
            scorecardInnings,
            ext,
            rules,
            player.position
          )
        : {
            batting: [],
            bowling: [],
            fielding: [],
            localSubtotal: 0,
            appearsOnScorecard: false,
            playingXiPointsAwarded: 0,
            threeCatchBonusAwarded: 0,
            totalCatchesInMatch: 0,
          };

    let cricapiMatchPointsTotal: number | null = null;
    const localOnly = process.env.FANTASY_POINTS_LOCAL_ONLY?.trim() === "true";
    if (!localOnly) {
      try {
        const mp = await fetchMatchPoints(trimmedExt, {
          rulesetId: league.cricapiFantasyRulesetId,
        });
        const totals = aggregateFantasyPointsByPlayerId(mp);
        for (const [k, v] of totals.entries()) {
          if (k.toLowerCase() === ext && Number.isFinite(v)) {
            cricapiMatchPointsTotal = Math.round(v * 100) / 100;
            break;
          }
        }
      } catch {
        notes.push("match_points could not be fetched for this fixture.");
      }
    }

    const xi = breakdown.playingXiPointsAwarded;
    const usesCricApiEngine =
      !localOnly && cricapiMatchPointsTotal !== null;
    const localRounded = Math.round(breakdown.localSubtotal * 100) / 100;
    const explainedTotal =
      usesCricApiEngine && cricapiMatchPointsTotal !== null
        ? Math.round((cricapiMatchPointsTotal + xi) * 100) / 100
        : Math.round((localRounded + xi) * 100) / 100;

    const storedPointsMode: "match_points_plus_xi" | "local_scorecard_plus_xi" =
      usesCricApiEngine && cricapiMatchPointsTotal !== null
        ? "match_points_plus_xi"
        : "local_scorecard_plus_xi";

    notes.push(
      "CricketData exposes a single `match_points` total per player (no per-rule JSON). Rule-level detail for that total is on your cricketdata.org fantasy dashboard."
    );
    if (storedPointsMode === "match_points_plus_xi") {
      notes.push(
        "Stored fantasy points use that total, plus only the in-app playing-XI / on-scorecard bonus below (not part of `match_points`)."
      );
      notes.push(
        "Batting, bowling, and fielding sections show your merged league rules applied to the scorecard — a reference audit trail; those line sums are not added again on top of `match_points`."
      );
    } else {
      notes.push(
        "Stored points use the in-app calculator only (scorecard + league rules + playing-XI). Set FANTASY_POINTS_LOCAL_ONLY=false and fix `match_points` to use CricketData totals."
      );
    }

    if (
      storedFantasyPoints != null &&
      Math.abs(storedFantasyPoints - explainedTotal) > 0.51
    ) {
      notes.push(
        `Stored points (${storedFantasyPoints}) differ from the reconstructed total (${explainedTotal}). Common causes: scorecard/API timing, or rescore with different feed data.`
      );
    }

    let adminPerformance: {
      stats: {
        runsScored: number;
        ballsFaced: number;
        fours: number;
        sixes: number;
        wicketsTaken: number;
        oversBowled: number;
        runsConceded: number;
        maidens: number;
        catches: number;
        stumpings: number;
        runOuts: number;
        dotBalls: number;
        strikeRate: number;
        economyRate: number;
        isDuck: boolean;
        isOut: boolean;
      };
      adminFantasyAdjustment: number;
      autoFantasyBase: number | null;
      importSays: "match_points" | "local_scorecard" | "unknown";
    } | null = null;

    if (viewerIsAdmin && perf) {
      let autoFantasyBase: number | null = null;
      let importSays: "match_points" | "local_scorecard" | "unknown" =
        "unknown";
      const computed = await computeAutoFantasyBaseForPlayer({
        leagueId,
        externalMatchId: trimmedExt,
        playerExternalIdLower: ext,
        scoringRulesOverride: league.scoringRules as Partial<ScoringRules> | null,
        cricapiFantasyRulesetId: league.cricapiFantasyRulesetId,
      });
      if (computed) {
        autoFantasyBase = Math.round(computed.autoBase * 100) / 100;
        importSays = computed.useApi ? "match_points" : "local_scorecard";
      }
      adminPerformance = {
        stats: {
          runsScored: perf.runsScored,
          ballsFaced: perf.ballsFaced,
          fours: perf.fours,
          sixes: perf.sixes,
          wicketsTaken: perf.wicketsTaken,
          oversBowled: perf.oversBowled,
          runsConceded: perf.runsConceded,
          maidens: perf.maidens,
          catches: perf.catches,
          stumpings: perf.stumpings,
          runOuts: perf.runOuts,
          dotBalls: perf.dotBalls,
          strikeRate: Math.round(perf.strikeRate * 100) / 100,
          economyRate: Math.round(perf.economyRate * 100) / 100,
          isDuck: perf.isDuck,
          isOut: perf.isOut,
        },
        adminFantasyAdjustment:
          Math.round(perf.adminFantasyAdjustment * 100) / 100,
        autoFantasyBase,
        importSays,
      };
    }

    return NextResponse.json({
      leagueName: league.name,
      match: {
        id: match.id,
        team1: match.team1,
        team2: match.team2,
        status: match.status,
        matchDate: match.matchDate,
      },
      player: {
        id: player.id,
        name: player.name,
        position: player.position,
        externalId: player.externalId,
      },
      storedFantasyPoints,
      cricapiMatchPointsTotal,
      localSubtotal: localRounded,
      playingXiPointsAwarded: xi,
      explainedTotal,
      usesCricApiEngine,
      composition: {
        mode: storedPointsMode,
        cricketDataMatchPoints: cricapiMatchPointsTotal,
        cricketDataCountsTowardStored: usesCricApiEngine,
        appPlayingXiBonus: xi,
        appLocalRulesSubtotal: localRounded,
        referenceBreakdownCaption:
          storedPointsMode === "match_points_plus_xi"
            ? "Reference only — same scorecard scored with your merged in-app rules (not added to stored points on top of match_points)."
            : "These line items sum to the local part of stored points; playing-XI is added separately in the summary.",
      },
      batting: breakdown.batting,
      bowling: breakdown.bowling,
      fielding: breakdown.fielding,
      threeCatchBonusAwarded: breakdown.threeCatchBonusAwarded,
      totalCatchesInMatch: breakdown.totalCatchesInMatch,
      notes,
      viewerIsAdmin,
      adminPerformance,
    });
  } catch (err) {
    console.error("GET fantasy-breakdown error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
