import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin, requireLeagueMember } from "@/lib/auction-helpers";
import { fetchMatchScorecard } from "@/lib/cricapi";

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

    const viewerIsAdmin = Boolean(
      member.role === "OWNER" || member.role === "ADMIN"
    );

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
      viewerIsAdmin,
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/matches/[matchId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  try {
    const { id: leagueId, matchId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const externalMatchId = String(body.externalMatchId ?? "").trim();
    const validate = body.validate !== false;

    if (!externalMatchId) {
      return NextResponse.json(
        { error: "externalMatchId is required" },
        { status: 400 }
      );
    }

    const match = await prisma.leagueMatch.findFirst({
      where: { id: matchId, leagueId },
    });
    if (!match) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (validate && process.env.CRICAPI_KEY) {
      try {
        await fetchMatchScorecard(externalMatchId);
      } catch {
        return NextResponse.json(
          { error: "CricAPI could not load scorecard for this match id" },
          { status: 400 }
        );
      }
    }

    const nextDate =
      body.matchDate != null && body.matchDate !== ""
        ? new Date(String(body.matchDate))
        : undefined;
    const team1 =
      typeof body.team1 === "string" && body.team1.trim()
        ? body.team1.trim()
        : undefined;
    const team2 =
      typeof body.team2 === "string" && body.team2.trim()
        ? body.team2.trim()
        : undefined;

    const updated = await prisma.leagueMatch.update({
      where: { id: matchId },
      data: {
        externalMatchId: externalMatchId.toLowerCase(),
        ...(nextDate && !Number.isNaN(nextDate.getTime())
          ? { matchDate: nextDate }
          : {}),
        ...(team1 !== undefined ? { team1 } : {}),
        ...(team2 !== undefined ? { team2 } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      externalMatchId: updated.externalMatchId,
      team1: updated.team1,
      team2: updated.team2,
      matchDate: updated.matchDate,
      status: updated.status,
    });
  } catch (err) {
    console.error("PATCH /api/leagues/[id]/matches/[matchId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
