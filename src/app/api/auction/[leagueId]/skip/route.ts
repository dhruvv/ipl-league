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
      select: {
        phase: true,
        currentPlayer: true,
        currentPot: true,
        currentPlayerIndex: true,
      },
    });

    if (league.phase !== "AUCTION_ACTIVE" || !league.currentPlayer) {
      return NextResponse.json(
        { error: "No player selected" },
        { status: 400 }
      );
    }

    await prisma.player.update({
      where: { id: league.currentPlayer },
      data: { status: "UNSOLD" },
    });

    auctionEmitter.emit(leagueId, "player-skipped", {
      playerId: league.currentPlayer,
    });

    if (league.currentPot) {
      const potPlayers = await prisma.player.findMany({
        where: { leagueId, pot: league.currentPot },
        orderBy: [{ slNo: "asc" }, { name: "asc" }],
        select: { id: true },
      });

      const nextIndex = league.currentPlayerIndex + 1;
      if (nextIndex < potPlayers.length) {
        const nextPlayer = potPlayers[nextIndex];
        await prisma.league.update({
          where: { id: leagueId },
          data: {
            currentPlayerIndex: nextIndex,
            currentPlayer: nextPlayer.id,
          },
        });

        await prisma.player.update({
          where: { id: nextPlayer.id },
          data: { status: "ACTIVE" },
        });

        auctionEmitter.emit(leagueId, "player-active", {
          currentPlayerIndex: nextIndex,
          currentPlayerId: nextPlayer.id,
        });

        return NextResponse.json({
          skipped: true,
          nextPlayerId: nextPlayer.id,
        });
      }
    }

    return NextResponse.json({ skipped: true, endOfPot: true });
  } catch (err) {
    console.error("POST /api/auction/[leagueId]/skip error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
