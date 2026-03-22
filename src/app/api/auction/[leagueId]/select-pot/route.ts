import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { auctionEmitter } from "@/lib/auction-events";

export async function POST(
  req: Request,
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

    const { pot } = await req.json();
    if (!pot)
      return NextResponse.json({ error: "Pot is required" }, { status: 400 });

    const league = await prisma.league.findUniqueOrThrow({
      where: { id: leagueId },
      select: { phase: true },
    });

    if (league.phase !== "AUCTION_ACTIVE") {
      return NextResponse.json(
        { error: "Auction is not active" },
        { status: 400 }
      );
    }

    const potPlayers = await prisma.player.findMany({
      where: { leagueId, pot },
      orderBy: [{ slNo: "asc" }, { name: "asc" }],
      select: { id: true },
    });

    if (potPlayers.length === 0) {
      return NextResponse.json(
        { error: "No players in this pot" },
        { status: 400 }
      );
    }

    const firstPlayer = potPlayers[0];

    await prisma.league.update({
      where: { id: leagueId },
      data: {
        currentPot: pot,
        currentPlayerIndex: 0,
        currentPlayer: firstPlayer.id,
      },
    });

    await prisma.player.update({
      where: { id: firstPlayer.id },
      data: { status: "ACTIVE" },
    });

    auctionEmitter.emit(leagueId, "pot-selected", {
      pot,
      currentPlayerIndex: 0,
      currentPlayerId: firstPlayer.id,
    });

    return NextResponse.json({ pot, currentPlayerId: firstPlayer.id });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/select-pot error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
