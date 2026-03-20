import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { auctionEmitter } from "@/lib/auction-events";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await requireAuctionAdmin(leagueId, session.user.id);
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { phase: true, currentPot: true, currentPlayerIndex: true },
  });

  if (league.phase !== "AUCTION_ACTIVE" || !league.currentPot) {
    return NextResponse.json(
      { error: "Select a pot first" },
      { status: 400 }
    );
  }

  const potPlayers = await prisma.player.findMany({
    where: { leagueId, pot: league.currentPot },
    orderBy: [{ slNo: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const nextIndex = league.currentPlayerIndex + 1;
  if (nextIndex >= potPlayers.length) {
    return NextResponse.json(
      { error: "No more players in this pot" },
      { status: 400 }
    );
  }

  const nextPlayer = potPlayers[nextIndex];

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      currentPlayerIndex: nextIndex,
      currentPlayer: nextPlayer.id,
    },
  });

  const player = await prisma.player.findUniqueOrThrow({
    where: { id: nextPlayer.id },
    select: { status: true },
  });

  if (player.status === "QUEUED") {
    await prisma.player.update({
      where: { id: nextPlayer.id },
      data: { status: "ACTIVE" },
    });
  }

  auctionEmitter.emit(leagueId, "player-active", {
    currentPlayerIndex: nextIndex,
    currentPlayerId: nextPlayer.id,
  });

  return NextResponse.json({
    currentPlayerIndex: nextIndex,
    currentPlayerId: nextPlayer.id,
  });
}
