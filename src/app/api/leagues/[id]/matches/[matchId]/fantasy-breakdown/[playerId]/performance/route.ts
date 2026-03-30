import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { computeAutoFantasyBaseForPlayer } from "@/lib/scorecard-import";
import { scoringEmitter } from "@/lib/scoring-events";
import type { ScoringRules } from "@/lib/scoring";
import type { Prisma } from "@/generated/prisma/client";

function finiteNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function safeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(
    Math.max(-2_147_483_648, Math.min(2_147_483_647, n))
  );
}

/**
 * League owners/admins: adjust stored `PlayerPerformance` for one player in one match.
 * `adminFantasyAdjustment` is kept across scorecard re-imports; stored
 * `fantasyPoints` = fresh auto base (API or local + XI) + that adjustment.
 */
export async function PATCH(
  req: Request,
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

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as Record<string, unknown>;

    const [player, match, league] = await Promise.all([
      prisma.player.findFirst({
        where: { id: playerId, leagueId },
        select: { id: true, externalId: true },
      }),
      prisma.leagueMatch.findFirst({
        where: { id: matchId, leagueId },
        select: { id: true, externalMatchId: true },
      }),
      prisma.league.findUnique({
        where: { id: leagueId },
        select: { scoringRules: true, cricapiFantasyRulesetId: true },
      }),
    ]);

    if (!player || !match) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const perf = await prisma.playerPerformance.findUnique({
      where: { playerId_matchId: { playerId, matchId } },
    });

    if (!perf) {
      return NextResponse.json(
        {
          error:
            "No performance row for this player in this match. Import the scorecard first.",
        },
        { status: 404 }
      );
    }

    const ext = player.externalId?.trim().toLowerCase() ?? "";
    const extMatch = match.externalMatchId?.trim() ?? "";

    let autoBase = perf.fantasyPoints - perf.adminFantasyAdjustment;
    const computed =
      ext && extMatch && league
        ? await computeAutoFantasyBaseForPlayer({
            leagueId,
            externalMatchId: extMatch,
            playerExternalIdLower: ext,
            scoringRulesOverride: league.scoringRules as Partial<ScoringRules> | null,
            cricapiFantasyRulesetId: league.cricapiFantasyRulesetId,
          })
        : null;
    if (computed) {
      autoBase = computed.autoBase;
    }

    const newAdj =
      finiteNumber(body.adminFantasyAdjustment) ?? perf.adminFantasyAdjustment;
    const fantasyPoints = autoBase + newAdj;

    const data: Prisma.PlayerPerformanceUpdateInput = {
      adminFantasyAdjustment: newAdj,
      fantasyPoints,
    };

    const ri = (k: keyof typeof body) => {
      const v = finiteNumber(body[k]);
      if (v === undefined) return safeInt(0);
      return safeInt(v);
    };
    if (body.runsScored !== undefined) data.runsScored = ri("runsScored");
    if (body.ballsFaced !== undefined) data.ballsFaced = ri("ballsFaced");
    if (body.fours !== undefined) data.fours = ri("fours");
    if (body.sixes !== undefined) data.sixes = ri("sixes");
    if (body.wicketsTaken !== undefined) data.wicketsTaken = ri("wicketsTaken");
    if (body.runsConceded !== undefined) data.runsConceded = ri("runsConceded");
    if (body.maidens !== undefined) data.maidens = ri("maidens");
    if (body.catches !== undefined) data.catches = ri("catches");
    if (body.stumpings !== undefined) data.stumpings = ri("stumpings");
    if (body.runOuts !== undefined) data.runOuts = ri("runOuts");
    if (body.dotBalls !== undefined) data.dotBalls = ri("dotBalls");

    const overs = finiteNumber(body.oversBowled);
    if (overs !== undefined) data.oversBowled = overs;

    const sr = finiteNumber(body.strikeRate);
    if (sr !== undefined) data.strikeRate = sr;

    const eco = finiteNumber(body.economyRate);
    if (eco !== undefined) data.economyRate = eco;

    if (typeof body.isDuck === "boolean") data.isDuck = body.isDuck;
    if (typeof body.isOut === "boolean") data.isOut = body.isOut;

    await prisma.playerPerformance.update({
      where: { playerId_matchId: { playerId, matchId } },
      data,
    });

    scoringEmitter.emit(leagueId, "score-update", {
      matchId,
      externalMatchId: extMatch,
      playerCount: 1,
    });

    return NextResponse.json({
      ok: true,
      fantasyPoints: Math.round(fantasyPoints * 100) / 100,
      adminFantasyAdjustment: Math.round(newAdj * 100) / 100,
      autoFantasyBase: Math.round(autoBase * 100) / 100,
    });
  } catch (err) {
    console.error("PATCH performance error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
