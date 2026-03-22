import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";

const VALID_TRANSITIONS: Record<string, string> = {
  AUCTION_COMPLETE: "LEAGUE_ACTIVE",
  LEAGUE_ACTIVE: "LEAGUE_COMPLETE",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { phase: true },
    });

    const body = await req.json();
    const targetPhase = body.phase as string;

    if (VALID_TRANSITIONS[league.phase] !== targetPhase) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${league.phase} to ${targetPhase}`,
        },
        { status: 400 }
      );
    }

    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: { phase: targetPhase as "LEAGUE_ACTIVE" | "LEAGUE_COMPLETE" },
    });

    return NextResponse.json({ phase: updated.phase });
  } catch (err) {
    console.error("POST /api/leagues/[id]/phase error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
