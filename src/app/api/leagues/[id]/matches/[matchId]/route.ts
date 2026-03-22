import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: leagueId, matchId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const match = await prisma.leagueMatch.findUnique({
      where: { id: matchId },
      include: {
        performances: {
          orderBy: { fantasyPoints: "desc" },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                country: true,
                iplTeam: true,
                soldToTeamId: true,
              },
            },
          },
        },
      },
    });

    if (!match || match.leagueId !== leagueId) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const teams = await prisma.team.findMany({
      where: { leagueId },
      select: { id: true, name: true },
    });

    const teamMap = new Map(teams.map((t) => [t.id, t.name]));

    const performances = match.performances.map((p) => ({
      id: p.id,
      playerId: p.playerId,
      playerName: p.player.name,
      position: p.player.position,
      country: p.player.country,
      iplTeam: p.player.iplTeam,
      teamId: p.player.soldToTeamId,
      teamName: p.player.soldToTeamId
        ? teamMap.get(p.player.soldToTeamId) ?? null
        : null,
      runsScored: p.runsScored,
      ballsFaced: p.ballsFaced,
      fours: p.fours,
      sixes: p.sixes,
      strikeRate: p.strikeRate,
      wicketsTaken: p.wicketsTaken,
      oversBowled: p.oversBowled,
      runsConceded: p.runsConceded,
      maidens: p.maidens,
      economyRate: p.economyRate,
      catches: p.catches,
      stumpings: p.stumpings,
      runOuts: p.runOuts,
      fantasyPoints: Math.round(p.fantasyPoints * 10) / 10,
      isDuck: p.isDuck,
      isOut: p.isOut,
    }));

    return NextResponse.json({
      id: match.id,
      externalMatchId: match.externalMatchId,
      team1: match.team1,
      team2: match.team2,
      status: match.status,
      matchDate: match.matchDate,
      performances,
      teams,
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/matches/[matchId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
