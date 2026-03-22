import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const { id: leagueId, teamId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member)
      return NextResponse.json({ error: "Not a member" }, { status: 403 });

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, email: true } } },
        },
      },
    });

    if (!team || team.leagueId !== leagueId) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { budget: true, overseasCap: true },
    });

    const soldPlayers = await prisma.player.findMany({
      where: { leagueId, status: "SOLD", soldToTeamId: teamId },
      select: {
        id: true,
        name: true,
        position: true,
        country: true,
        iplTeam: true,
        basePrice: true,
        soldPrice: true,
      },
      orderBy: { soldPrice: "desc" },
    });

    const spent = soldPlayers.reduce((sum, p) => sum + (p.soldPrice ?? 0), 0);
    const overseasCount = soldPlayers.filter((p) => p.country !== "India").length;

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        members: team.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          username: m.user.username,
          email: m.user.email,
          role: m.role,
        })),
      },
      players: soldPlayers,
      budget: {
        total: league.budget,
        spent,
        remaining: league.budget - spent,
        overseasCount,
        overseasCap: league.overseasCap,
        playerCount: soldPlayers.length,
      },
    });
  } catch (err) {
    console.error("GET /api/leagues/[id]/teams/[teamId] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
