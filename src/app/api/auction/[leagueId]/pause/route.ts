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
      select: { phase: true, currentPlayer: true },
    });

    if (league.phase !== "AUCTION_ACTIVE") {
      return NextResponse.json(
        { error: "Can only pause an active auction" },
        { status: 400 }
      );
    }

    if (league.currentPlayer) {
      const player = await prisma.player.findUnique({
        where: { id: league.currentPlayer },
        select: { status: true },
      });
      if (player?.status === "BIDDING_OPEN") {
        await prisma.player.update({
          where: { id: league.currentPlayer },
          data: { status: "ACTIVE" },
        });
      }
    }

    await prisma.league.update({
      where: { id: leagueId },
      data: { phase: "AUCTION_PAUSED" },
    });

    auctionEmitter.emit(leagueId, "auction-paused", {
      phase: "AUCTION_PAUSED",
    });

    return NextResponse.json({ phase: "AUCTION_PAUSED" });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/pause error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
