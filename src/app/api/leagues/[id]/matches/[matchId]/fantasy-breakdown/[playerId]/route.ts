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
      select: { fantasyPoints: true },
    });

    const storedFantasyPoints = perf
      ? Math.round(perf.fantasyPoints * 100) / 100
      : null;

    const notes: string[] = [
      "Scorecard breakdown uses your merged league scoring rules. Stored points usually follow CricketData match_points plus playing-XI add-on when applicable.",
    ];

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
      batting: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["batting"],
      bowling: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["bowling"],
      fielding: [] as ReturnType<typeof buildPlayerFantasyBreakdown>["fielding"],
      notes,
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

    if (
      storedFantasyPoints != null &&
      Math.abs(storedFantasyPoints - explainedTotal) > 0.51
    ) {
      notes.push(
        `Stored points (${storedFantasyPoints}) differ from the reconstructed total (${explainedTotal}). Common causes: scorecard/API timing, or rescore with different feed data.`
      );
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
      batting: breakdown.batting,
      bowling: breakdown.bowling,
      fielding: breakdown.fielding,
      notes,
    });
  } catch (err) {
    console.error("GET fantasy-breakdown error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
