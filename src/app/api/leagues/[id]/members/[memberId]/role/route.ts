import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: leagueId, memberId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const caller = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: { leagueId, userId: session.user.id },
      },
    });

    if (!caller || (caller.role !== "OWNER" && caller.role !== "ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { role } = await req.json();
    if (role !== "ADMIN" && role !== "MEMBER") {
      return NextResponse.json(
        { error: "Role must be ADMIN or MEMBER" },
        { status: 400 }
      );
    }

    const target = await prisma.leagueMember.findUnique({
      where: { id: memberId },
    });

    if (!target || target.leagueId !== leagueId) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    if (target.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot change the owner's role" },
        { status: 400 }
      );
    }

    const updated = await prisma.leagueMember.update({
      where: { id: memberId },
      data: { role },
      include: { user: { select: { username: true } } },
    });

    return NextResponse.json({
      memberId: updated.id,
      userId: updated.userId,
      username: updated.user.username,
      role: updated.role,
    });
  } catch (err) {
    console.error("POST /api/leagues/[id]/members/[memberId]/role error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
