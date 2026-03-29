import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { scoringSyncSecretMatches } from "@/lib/internal-api";
import { applyScorecardToLeagueMatch } from "@/lib/scorecard-import";
import type { ScoringRules } from "@/lib/scoring";

type RowResult = {
  matchId: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  performancesUpserted?: number;
  hadScorecardInnings?: boolean;
  matchStatus?: string;
  error?: string;
};

/**
 * Batch re-run scorecard + fantasy import for historical matches (same logic as
 * POST .../matches/[matchId]/import-scorecard). Use after fixing ruleset, API key, or mappings.
 *
 * Body: `{ "matchIds": string[] }` or `{ "scope": "allCompleted" }`.
 * Auth: league admin session or Bearer SCORING_SYNC_SECRET.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;

    if (!process.env.CRICAPI_KEY) {
      return NextResponse.json(
        { error: "CRICAPI_KEY is not configured" },
        { status: 503 }
      );
    }

    const session = await auth();
    const bearerOk = scoringSyncSecretMatches(req);
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

    const body = (await req.json().catch(() => ({}))) as {
      matchIds?: unknown;
      scope?: unknown;
    };

    const matchIds =
      Array.isArray(body.matchIds) && body.matchIds.length > 0
        ? body.matchIds.map((id) => String(id))
        : null;
    const scopeAllCompleted = body.scope === "allCompleted";

    let rows: { id: string; externalMatchId: string }[];

    if (matchIds) {
      rows = await prisma.leagueMatch.findMany({
        where: { leagueId, id: { in: matchIds } },
        select: { id: true, externalMatchId: true },
      });
    } else if (scopeAllCompleted) {
      rows = await prisma.leagueMatch.findMany({
        where: { leagueId, status: "COMPLETED" },
        select: { id: true, externalMatchId: true },
      });
    } else {
      return NextResponse.json(
        {
          error:
            'Provide matchIds (array) or { "scope": "allCompleted" } to rescore every completed match.',
        },
        { status: 400 }
      );
    }

    const results: RowResult[] = [];

    for (const row of rows) {
      const ext = row.externalMatchId?.trim();
      if (!ext) {
        results.push({
          matchId: row.id,
          ok: false,
          skipped: true,
          reason: "no externalMatchId",
        });
        continue;
      }

      try {
        const out = await applyScorecardToLeagueMatch({
          leagueId,
          matchId: row.id,
          externalMatchId: ext,
          scoringRulesOverride: league.scoringRules as Partial<ScoringRules> | null,
          cricapiFantasyRulesetId: league.cricapiFantasyRulesetId,
        });

        if (!out.ok) {
          results.push({
            matchId: row.id,
            ok: false,
            error: out.error ?? "unknown",
          });
          continue;
        }

        results.push({
          matchId: row.id,
          ok: true,
          performancesUpserted: out.performancesUpserted,
          hadScorecardInnings: out.hadScorecardInnings,
          matchStatus: out.matchStatus,
        });
      } catch (err) {
        results.push({
          matchId: row.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const okCount = results.filter((r) => r.ok && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failedCount = results.filter((r) => !r.ok && !r.skipped).length;

    return NextResponse.json({
      total: results.length,
      rescored: okCount,
      skipped: skippedCount,
      failed: failedCount,
      results,
    });
  } catch (err) {
    console.error("POST matches/rescore error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
