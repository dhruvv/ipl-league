import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;
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
      { error: "Teams can only be created during setup" },
      { status: 400 }
    );
  }

  const { name } = await req.json();
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Team name is required" },
      { status: 400 }
    );
  }

  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      leagueId,
    },
  });

  await prisma.leagueMember.update({
    where: { id: member.id },
    data: { teamId: team.id },
  });

  return NextResponse.json(team, { status: 201 });
}
