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

    if (player.status !== "BIDDING_OPEN") {
      return NextResponse.json(
        { error: "Bidding is not open" },
        { status: 400 }
      );
    }

    const highestBid = await prisma.bid.findFirst({
      where: { playerId: league.currentPlayer, leagueId },
      orderBy: { amount: "desc" },
      include: {
        user: { select: { username: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (highestBid && highestBid.teamId) {
      await prisma.player.update({
        where: { id: league.currentPlayer },
        data: {
          status: "SOLD",
          soldToTeamId: highestBid.teamId,
          soldPrice: highestBid.amount,
        },
      });

      auctionEmitter.emit(leagueId, "bidding-closed", {
        playerId: player.id,
        playerName: player.name,
        result: "SOLD",
        soldToTeamId: highestBid.teamId,
        teamName: highestBid.team?.name ?? "Unknown",
        buyerName: highestBid.user.username,
        soldPrice: highestBid.amount,
      });

      return NextResponse.json({
        result: "SOLD",
        soldToTeamId: highestBid.teamId,
        teamName: highestBid.team?.name ?? "Unknown",
        buyerName: highestBid.user.username,
        soldPrice: highestBid.amount,
      });
    }

    await prisma.player.update({
      where: { id: league.currentPlayer },
      data: { status: "UNSOLD" },
    });

    auctionEmitter.emit(leagueId, "bidding-closed", {
      playerId: player.id,
      playerName: player.name,
      result: "UNSOLD",
    });

    return NextResponse.json({ result: "UNSOLD" });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/close-bidding error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
