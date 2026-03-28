import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { scoringSyncSecretMatches } from "@/lib/internal-api";
import { applyScorecardToLeagueMatch } from "@/lib/scorecard-import";
import type { ScoringRules } from "@/lib/scoring";

/**
 * Re-fetch CricAPI scorecard (and match_points when available) and upsert PlayerPerformance.
 * Use after a match finishes if the server missed the final poll, or to backfill after linking externalMatchId.
 * Auth: league admin session or Authorization: Bearer SCORING_SYNC_SECRET.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: leagueId, matchId } = await params;

    if (!process.env.CRICAPI_KEY) {
      return NextResponse.json(
        { error: "CRICAPI_KEY is not configured" },
        { status: 503 }
      );
    }

    const session = await auth();
    const bearerOk = scoringSyncSecretMatches(_req);
    let admin = null as Awaited<ReturnType<typeof requireAuctionAdmin>>;
    if (session?.user?.id) {
      admin = await requireAuctionAdmin(leagueId, session.user.id);
    }

    if (!bearerOk && !admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: session?.user?.id ? 403 : 401 }
      );
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        scoringRules: true,
        cricapiFantasyRulesetId: true,
      },
    });
    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    const match = await prisma.leagueMatch.findFirst({
      where: { id: matchId, leagueId },
      select: { externalMatchId: true, status: true },
    });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const ext = match.externalMatchId?.trim();
    if (!ext) {
      return NextResponse.json(
        {
          error:
            "Match has no externalMatchId. Set it on the league match (PATCH) then retry.",
        },
        { status: 400 }
      );
    }

    const result = await applyScorecardToLeagueMatch({
      leagueId,
      matchId,
      externalMatchId: ext,
      scoringRulesOverride: league.scoringRules as Partial<ScoringRules> | null,
      cricapiFantasyRulesetId: league.cricapiFantasyRulesetId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Import failed" },
        { status: 500 }
      );
    }

    if (!result.hadScorecardInnings) {
      return NextResponse.json({
        ok: true,
        message:
          "CricAPI returned no innings yet. Try again after the feed has a scorecard.",
        performancesUpserted: 0,
        matchStatus: result.matchStatus,
        hadScorecardInnings: false,
      });
    }

    return NextResponse.json({
      ok: true,
      performancesUpserted: result.performancesUpserted,
      matchStatus: result.matchStatus,
      hadScorecardInnings: true,
    });
  } catch (err) {
    console.error("POST import-scorecard error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
