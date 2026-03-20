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

export interface TeamBudgetInfo {
  teamId: string;
  teamName: string;
  memberUserIds: string[];
  totalBudget: number;
  spent: number;
  remaining: number;
  overseasCount: number;
  playerCount: number;
}

export async function calculateBudgets(
  leagueId: string
): Promise<TeamBudgetInfo[]> {
  const league = await prisma.league.findUniqueOrThrow({
    where: { id: leagueId },
    select: { budget: true, overseasCap: true },
  });

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: {
      members: { select: { userId: true } },
    },
  });

  const soldPlayers = await prisma.player.findMany({
    where: { leagueId, status: "SOLD" },
    select: { soldToTeamId: true, soldPrice: true, country: true },
  });

  return teams.map((team) => {
    const teamPlayers = soldPlayers.filter((p) => p.soldToTeamId === team.id);
    const spent = teamPlayers.reduce((sum, p) => sum + (p.soldPrice ?? 0), 0);
    const overseasCount = teamPlayers.filter(
      (p) => p.country !== "India"
    ).length;

    return {
      teamId: team.id,
      teamName: team.name,
      memberUserIds: team.members.map((m) => m.userId),
      totalBudget: league.budget,
      spent,
      remaining: league.budget - spent,
      overseasCount,
      playerCount: teamPlayers.length,
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
      minBidIncrement: true,
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
      soldToTeamId: true,
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
    teamId: string | null;
    teamName: string | null;
    createdAt: Date;
  }[] = [];

  if (currentPlayer) {
    const bids = await prisma.bid.findMany({
      where: { playerId: currentPlayer.id, leagueId },
      include: {
        user: { select: { username: true } },
        team: { select: { name: true } },
      },
      orderBy: { amount: "desc" },
    });
    currentBids = bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      userId: b.userId,
      username: b.user.username,
      teamId: b.teamId,
      teamName: b.team?.name ?? null,
      createdAt: b.createdAt,
    }));
  }

  const budgets = await calculateBudgets(leagueId);

  const teams = await prisma.team.findMany({
    where: { leagueId },
    include: { members: { select: { userId: true } } },
  });

  const teamsMap = teams.map((t) => ({
    id: t.id,
    name: t.name,
    memberUserIds: t.members.map((m) => m.userId),
  }));

  const soldLog = players
    .filter((p) => p.status === "SOLD")
    .map((p) => {
      const buyerTeam = budgets.find((b) => b.teamId === p.soldToTeamId);
      return {
        playerId: p.id,
        playerName: p.name,
        soldToTeamId: p.soldToTeamId,
        teamName: buyerTeam?.teamName ?? "Unknown",
        soldPrice: p.soldPrice,
      };
    });

  const upcomingPlayers = league.currentPot
    ? potPlayers
        .slice(league.currentPlayerIndex + 1)
        .filter((p) => p.status !== "SOLD" && p.status !== "UNSOLD")
        .slice(0, 5)
    : [];

  return {
    league,
    players,
    pots,
    potPlayers,
    currentPlayer,
    currentBids,
    budgets,
    soldLog,
    teams: teamsMap,
    upcomingPlayers,
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
      minBidIncrement: true,
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

  if (highestBid) {
    const minRequired = highestBid.amount + league.minBidIncrement;
    if (amount < minRequired) {
      return {
        ok: false as const,
        error: `Bid must be at least ${minRequired.toLocaleString()} (current ${highestBid.amount.toLocaleString()} + ${league.minBidIncrement.toLocaleString()} increment)`,
      };
    }
  }

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId } },
    select: { teamId: true },
  });

  if (!member) {
    return { ok: false as const, error: "You are not a member of this league" };
  }

  if (!member.teamId) {
    return { ok: false as const, error: "You must join a team before bidding" };
  }

  const budgets = await calculateBudgets(leagueId);
  const myTeamBudget = budgets.find((b) => b.teamId === member.teamId);

  if (!myTeamBudget) {
    return { ok: false as const, error: "Team budget not found" };
  }

  if (amount > myTeamBudget.remaining) {
    return {
      ok: false as const,
      error: `Insufficient team budget (${myTeamBudget.remaining.toLocaleString()} remaining)`,
    };
  }

  if (
    player.country !== "India" &&
    myTeamBudget.overseasCount >= league.overseasCap
  ) {
    return {
      ok: false as const,
      error: `Team overseas cap reached (${myTeamBudget.overseasCount}/${league.overseasCap})`,
    };
  }

  return { ok: true as const, teamId: member.teamId };
}
