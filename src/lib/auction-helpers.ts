import { prisma } from "./prisma";

export async function requireLeagueMember(leagueId: string, userId: string) {
  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
  });
  return member;
}

export async function requireAuctionAdmin(leagueId: string, userId: string) {
  const member = await requireLeagueMember(leagueId, userId);
  if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
    return null;
  }
  return member;
}

export interface BudgetInfo {
  userId: string;
  username: string;
  totalBudget: number;
  spent: number;
  remaining: number;
  overseasCount: number;
  playerCount: number;
}

export async function calculateBudgets(
  leagueId: string
): Promise<BudgetInfo[]> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { budget: true, overseasCap: true },
  });

  const members = await prisma.leagueMember.findMany({
    where: { leagueId },
    include: { user: { select: { username: true } } },
  });

  const soldPlayers = await prisma.player.findMany({
    where: { leagueId, status: "SOLD" },
    select: { soldTo: true, soldPrice: true, country: true },
  });

  return members.map((m) => {
    const myPlayers = soldPlayers.filter((p) => p.soldTo === m.userId);
    const spent = myPlayers.reduce((sum, p) => sum + (p.soldPrice ?? 0), 0);
    const overseasCount = myPlayers.filter(
      (p) => p.country !== "India"
    ).length;

    return {
      userId: m.userId,
      username: m.user.username,
      totalBudget: league.budget,
      spent,
      remaining: league.budget - spent,
      overseasCount,
      playerCount: myPlayers.length,
    };
  });
}

export async function getAuctionState(leagueId: string) {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      phase: true,
      budget: true,
      overseasCap: true,
      currentPot: true,
      currentPlayer: true,
      currentPlayerIndex: true,
    },
  });

  const players = await prisma.player.findMany({
    where: { leagueId },
    orderBy: [{ pot: "asc" }, { slNo: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slNo: true,
      name: true,
      position: true,
      country: true,
      bowlingStyle: true,
      battingStyle: true,
      iplTeam: true,
      basePrice: true,
      pot: true,
      status: true,
      soldTo: true,
      soldPrice: true,
    },
  });

  const pots = [...new Set(players.map((p) => p.pot))].sort();
  const potPlayers = league.currentPot
    ? players.filter((p) => p.pot === league.currentPot)
    : [];

  const currentPlayer = league.currentPlayer
    ? players.find((p) => p.id === league.currentPlayer) ?? null
    : null;

  let currentBids: {
    id: string;
    amount: number;
    userId: string;
    username: string;
    createdAt: Date;
  }[] = [];

  if (currentPlayer) {
    const bids = await prisma.bid.findMany({
      where: { playerId: currentPlayer.id, leagueId },
      include: { user: { select: { username: true } } },
      orderBy: { amount: "desc" },
    });
    currentBids = bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      userId: b.userId,
      username: b.user.username,
      createdAt: b.createdAt,
    }));
  }

  const budgets = await calculateBudgets(leagueId);

  const soldLog = players
    .filter((p) => p.status === "SOLD")
    .map((p) => {
      const buyer = budgets.find((b) => b.userId === p.soldTo);
      return {
        playerId: p.id,
        playerName: p.name,
        soldTo: p.soldTo,
        buyerName: buyer?.username ?? "Unknown",
        soldPrice: p.soldPrice,
      };
    });

  return {
    league,
    players,
    pots,
    potPlayers,
    currentPlayer,
    currentBids,
    budgets,
    soldLog,
  };
}

export async function validateBid(
  leagueId: string,
  userId: string,
  amount: number
) {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: {
      phase: true,
      currentPlayer: true,
      overseasCap: true,
      budget: true,
    },
  });

  if (league.phase !== "AUCTION_ACTIVE") {
    return { ok: false as const, error: "Auction is not active" };
  }

  if (!league.currentPlayer) {
    return { ok: false as const, error: "No player is currently up for bidding" };
  }

  const player = await prisma.player.findUnique({
    where: { id: league.currentPlayer },
    select: { status: true, basePrice: true, country: true },
  });

  if (!player || player.status !== "BIDDING_OPEN") {
    return { ok: false as const, error: "Bidding is not open for this player" };
  }

  if (amount < player.basePrice) {
    return { ok: false as const, error: "Bid must be at least the base price" };
  }

  const highestBid = await prisma.bid.findFirst({
    where: { playerId: league.currentPlayer, leagueId },
    orderBy: { amount: "desc" },
    select: { amount: true },
  });

  if (highestBid && amount <= highestBid.amount) {
    return {
      ok: false as const,
      error: `Bid must exceed current highest (${highestBid.amount.toLocaleString()})`,
    };
  }

  const budgets = await calculateBudgets(leagueId);
  const myBudget = budgets.find((b) => b.userId === userId);

  if (!myBudget) {
    return { ok: false as const, error: "You are not a member of this league" };
  }

  if (amount > myBudget.remaining) {
    return {
      ok: false as const,
      error: `Insufficient budget (${myBudget.remaining.toLocaleString()} remaining)`,
    };
  }

  if (
    player.country !== "India" &&
    myBudget.overseasCount >= league.overseasCap
  ) {
    return {
      ok: false as const,
      error: `Overseas cap reached (${myBudget.overseasCount}/${league.overseasCap})`,
    };
  }

  return { ok: true as const };
}
