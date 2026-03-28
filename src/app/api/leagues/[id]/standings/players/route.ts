import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

/**
 * Per-player fantasy totals across scored matches (LIVE + COMPLETED) for the league.
 */
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

    const scoredMatches = await prisma.leagueMatch.findMany({
      where: {
        leagueId,
        status: { in: ["LIVE", "COMPLETED"] },
      },
      select: { id: true, team1: true, team2: true, matchDate: true, status: true },
      orderBy: { matchDate: "asc" },
    });
    const matchIds = scoredMatches.map((m) => m.id);

    const performances = await prisma.playerPerformance.findMany({
      where: { matchId: { in: matchIds } },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            soldToTeamId: true,
          },
        },
      },
    });

    const teams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true },
    });
    const teamName = new Map(teams.map((t) => [t.id, t.name]));

    type Row = {
      playerId: string;
      playerName: string;
      teamId: string | null;
      teamName: string | null;
      totalPoints: number;
      matchCount: number;
      byMatch: {
        matchId: string;
        label: string;
        points: number;
      }[];
    };

    const byPlayer = new Map<string, Row>();

    for (const perf of performances) {
      const pid = perf.playerId;
      const sold = perf.player.soldToTeamId;
      let row = byPlayer.get(pid);
      if (!row) {
        row = {
          playerId: pid,
          playerName: perf.player.name,
          teamId: sold,
          teamName: sold ? teamName.get(sold) ?? null : null,
          totalPoints: 0,
          matchCount: 0,
          byMatch: [],
        };
        byPlayer.set(pid, row);
      }
      row.totalPoints += perf.fantasyPoints;
      row.matchCount += 1;
      const m = scoredMatches.find((x) => x.id === perf.matchId);
      const label = m ? `${m.team1} vs ${m.team2}` : perf.matchId;
      row.byMatch.push({
        matchId: perf.matchId,
        label,
        points: Math.round(perf.fantasyPoints * 10) / 10,
      });
    }

    const players = [...byPlayer.values()].map((r) => ({
      ...r,
      totalPoints: Math.round(r.totalPoints * 10) / 10,
    }));
    players.sort((a, b) => b.totalPoints - a.totalPoints);

    return NextResponse.json({
      players,
      matchCount: scoredMatches.length,
    });
  } catch (err) {
    console.error("GET standings/players error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
