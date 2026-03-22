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
      select: { phase: true },
    });

    if (league.phase !== "AUCTION_ACTIVE" && league.phase !== "AUCTION_PAUSED") {
      return NextResponse.json(
        { error: "Auction is not active or paused" },
        { status: 400 }
      );
    }

    await prisma.player.updateMany({
      where: {
        leagueId,
        status: { in: ["QUEUED", "ACTIVE", "BIDDING_OPEN"] },
      },
      data: { status: "UNSOLD" },
    });

    await prisma.league.update({
      where: { id: leagueId },
      data: {
        phase: "AUCTION_COMPLETE",
        currentPot: null,
        currentPlayer: null,
      },
    });

    auctionEmitter.emit(leagueId, "auction-ended", {
      phase: "AUCTION_COMPLETE",
    });

    return NextResponse.json({ phase: "AUCTION_COMPLETE" });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/end error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
