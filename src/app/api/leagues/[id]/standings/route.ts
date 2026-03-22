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

    const completedMatches = await prisma.leagueMatch.findMany({
      where: { leagueId, status: { in: ["COMPLETED", "LIVE"] } },
      orderBy: { matchDate: "asc" },
      select: { id: true, team1: true, team2: true, status: true, matchDate: true },
    });

    const standings = [];

    for (const team of teams) {
      const playerIds = team.players.map((p) => p.id);
      let totalPoints = 0;
      const matchBreakdown: {
        matchId: string;
        team1: string;
        team2: string;
        points: number;
        topPlayers: { name: string; points: number }[];
      }[] = [];

      for (const match of completedMatches) {
        const performances = await prisma.playerPerformance.findMany({
          where: { matchId: match.id, playerId: { in: playerIds } },
          orderBy: { fantasyPoints: "desc" },
          include: { player: { select: { name: true } } },
        });

        const topN = performances.slice(0, league.scoringTopN);
        const matchPoints = topN.reduce((sum, p) => sum + p.fantasyPoints, 0);
        totalPoints += matchPoints;

        matchBreakdown.push({
          matchId: match.id,
          team1: match.team1,
          team2: match.team2,
          points: Math.round(matchPoints * 10) / 10,
          topPlayers: topN.map((p) => ({
            name: p.player.name,
            points: Math.round(p.fantasyPoints * 10) / 10,
          })),
        });
      }

      standings.push({
        teamId: team.id,
        teamName: team.name,
        totalPoints: Math.round(totalPoints * 10) / 10,
        playerCount: playerIds.length,
        matchBreakdown,
      });
    }

    standings.sort((a, b) => b.totalPoints - a.totalPoints);

    return NextResponse.json({
      standings,
      scoringTopN: league.scoringTopN,
      matchCount: completedMatches.length,
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/standings error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
