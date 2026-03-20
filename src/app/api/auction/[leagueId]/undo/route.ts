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

  const lastSold = await prisma.player.findFirst({
    where: { leagueId, status: "SOLD" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, soldTo: true, soldPrice: true },
  });

  if (!lastSold) {
    return NextResponse.json(
      { error: "No sales to undo" },
      { status: 400 }
    );
  }

  await prisma.player.update({
    where: { id: lastSold.id },
    data: { status: "QUEUED", soldTo: null, soldPrice: null },
  });

  await prisma.bid.deleteMany({
    where: { playerId: lastSold.id, leagueId },
  });

  auctionEmitter.emit(leagueId, "sale-undone", {
    playerId: lastSold.id,
    playerName: lastSold.name,
    previousBuyer: lastSold.soldTo,
    previousPrice: lastSold.soldPrice,
  });

  return NextResponse.json({
    undone: true,
    playerId: lastSold.id,
    playerName: lastSold.name,
  });
}
