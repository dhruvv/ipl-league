import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember, validateBid } from "@/lib/auction-helpers";
import { auctionEmitter } from "@/lib/auction-events";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await requireLeagueMember(leagueId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { amount } = await req.json();
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "Invalid bid amount" },
      { status: 400 }
    );
  }

  const validation = await validateBid(leagueId, session.user.id, amount);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    );
  }

  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { currentPlayer: true },
  });

  const bid = await prisma.bid.create({
    data: {
      playerId: league.currentPlayer!,
      userId: session.user.id,
      leagueId,
      amount,
    },
    include: { user: { select: { username: true } } },
  });

  auctionEmitter.emit(leagueId, "bid-placed", {
    bidId: bid.id,
    playerId: league.currentPlayer,
    userId: session.user.id,
    username: bid.user.username,
    amount: bid.amount,
  });

  return NextResponse.json({
    bidId: bid.id,
    amount: bid.amount,
  });
}
