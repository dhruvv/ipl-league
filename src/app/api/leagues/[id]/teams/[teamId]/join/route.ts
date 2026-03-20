import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  const { id: leagueId, teamId } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await requireLeagueMember(leagueId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { phase: true },
  });

  if (league.phase !== "SETUP") {
    return NextResponse.json(
      { error: "Teams can only be joined during setup" },
      { status: 400 }
    );
  }

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.leagueId !== leagueId) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { teamId },
  });

  return NextResponse.json({ joined: true, teamId });
}
