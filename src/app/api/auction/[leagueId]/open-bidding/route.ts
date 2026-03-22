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

    if (league.phase !== "AUCTION_ACTIVE" || !league.currentPlayer) {
      return NextResponse.json(
        { error: "No player selected" },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUniqueOrThrow({
      where: { id: league.currentPlayer },
      select: { status: true, name: true, id: true },
    });

    if (player.status !== "ACTIVE" && player.status !== "QUEUED") {
      return NextResponse.json(
        { error: `Player is already ${player.status}` },
        { status: 400 }
      );
    }

    await prisma.player.update({
      where: { id: league.currentPlayer },
      data: { status: "BIDDING_OPEN" },
    });

    auctionEmitter.emit(leagueId, "bidding-open", {
      playerId: player.id,
      playerName: player.name,
    });

    return NextResponse.json({ status: "BIDDING_OPEN" });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/open-bidding error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
