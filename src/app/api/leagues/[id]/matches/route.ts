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

    const matches = await prisma.leagueMatch.findMany({
      where: { leagueId },
      orderBy: { matchDate: "asc" },
      select: {
        id: true,
        externalMatchId: true,
        team1: true,
        team2: true,
        status: true,
        matchDate: true,
        _count: { select: { performances: true } },
      },
    });

    return NextResponse.json({ matches });
  } catch (err) {
    console.error("GET /api/leagues/[id]/matches error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
