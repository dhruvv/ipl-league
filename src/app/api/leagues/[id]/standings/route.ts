import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { scoringTopN: true },
    });

    const teams = await prisma.team.findMany({
      where: { leagueId },
      include: {
        players: {
          where: { status: "SOLD" },
          select: { id: true, name: true },
        },
      },
    });

    const scoredMatches = await prisma.leagueMatch.findMany({
      where: { leagueId, status: { in: ["COMPLETED", "LIVE"] } },
      orderBy: { matchDate: "asc" },
      select: { id: true },
    });

    const matchCount = scoredMatches.length;
    const standings = [];

    for (const team of teams) {
      const playerIds = team.players.map((p) => p.id);

      const allPerformances = await prisma.playerPerformance.findMany({
        where: { playerId: { in: playerIds }, matchId: { in: scoredMatches.map((m) => m.id) } },
        include: { player: { select: { name: true } } },
      });

      const seasonTotals = new Map<string, { name: string; points: number }>();
      for (const perf of allPerformances) {
        const existing = seasonTotals.get(perf.playerId);
        if (existing) {
          existing.points += perf.fantasyPoints;
        } else {
          seasonTotals.set(perf.playerId, {
            name: perf.player.name,
            points: perf.fantasyPoints,
          });
        }
      }

      const playerSeasonStats = [...seasonTotals.values()].sort(
        (a, b) => b.points - a.points
      );

      const countingPlayers = playerSeasonStats.slice(0, league.scoringTopN);
      const totalPoints = countingPlayers.reduce((sum, p) => sum + p.points, 0);

      standings.push({
        teamId: team.id,
        teamName: team.name,
        totalPoints: Math.round(totalPoints * 10) / 10,
        playerCount: playerIds.length,
        countingPlayers: countingPlayers.map((p) => ({
          name: p.name,
          points: Math.round(p.points * 10) / 10,
        })),
        benchPlayers: playerSeasonStats.slice(league.scoringTopN).map((p) => ({
          name: p.name,
          points: Math.round(p.points * 10) / 10,
        })),
      });
    }

    standings.sort((a, b) => b.totalPoints - a.totalPoints);

    return NextResponse.json({
      standings,
      scoringTopN: league.scoringTopN,
      matchCount,
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/standings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
