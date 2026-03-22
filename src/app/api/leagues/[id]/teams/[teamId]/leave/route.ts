import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function POST(
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

    if (member.teamId !== teamId) {
      return NextResponse.json(
        { error: "You are not on this team" },
        { status: 400 }
      );
    }

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { phase: true },
    });

    if (league.phase !== "SETUP") {
      return NextResponse.json(
        { error: "Teams can only be changed during setup" },
        { status: 400 }
      );
    }

    await prisma.leagueMember.update({
      where: { id: member.id },
      data: { teamId: null },
    });

    return NextResponse.json({ left: true });
  } catch (err) {
    console.error("POST /api/leagues/[id]/teams/[teamId]/leave error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
