import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { auctionEmitter } from "@/lib/auction-events";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
    const { leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { phase: true, _count: { select: { players: true } } },
    });

    if (league.phase !== "SETUP") {
      return NextResponse.json(
        { error: "Auction can only be started from SETUP phase" },
        { status: 400 }
      );
    }

    if (league._count.players === 0) {
      return NextResponse.json(
        { error: "Import players before starting the auction" },
        { status: 400 }
      );
    }

    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: {
        phase: "AUCTION_ACTIVE",
        currentPot: null,
        currentPlayer: null,
        currentPlayerIndex: 0,
      },
    });

    auctionEmitter.emit(leagueId, "auction-started", {
      phase: updated.phase,
    });

    return NextResponse.json({ phase: updated.phase });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/start error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
