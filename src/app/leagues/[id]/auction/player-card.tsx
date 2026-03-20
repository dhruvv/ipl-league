"use client";

import type { AuctionPlayer, BidEntry, TeamInfo } from "./auction-view";

interface PlayerCardProps {
  player: AuctionPlayer | null;
  highestBid: BidEntry | null;
  potPlayers: AuctionPlayer[];
  currentIndex: number;
  teams: TeamInfo[];
}

const statusColors: Record<string, string> = {
  QUEUED: "bg-gray-700 text-gray-300",
  ACTIVE: "bg-blue-900/50 text-blue-300",
  BIDDING_OPEN: "bg-emerald-900/50 text-emerald-300",
  SOLD: "bg-amber-900/50 text-amber-300",
  UNSOLD: "bg-red-900/50 text-red-300",
};

export function PlayerCard({
  player,
  highestBid,
  potPlayers,
  currentIndex,
  teams,
}: PlayerCardProps) {
  if (!player) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-500">
        Select a pot and navigate to a player to begin.
      </div>
    );
  }

  const soldTeam = player.soldToTeamId
    ? teams.find((t) => t.id === player.soldToTeamId)
    : null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{player.name}</h2>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                statusColors[player.status] ?? "bg-gray-700 text-gray-300"
              }`}
            >
              {player.status.replace("_", " ")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
            {player.position && <span>{player.position}</span>}
            <span
              className={
                player.country !== "India" ? "text-amber-400" : ""
              }
            >
              {player.country}
            </span>
            {player.iplTeam && <span>{player.iplTeam}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {player.battingStyle && (
              <span>Bat: {player.battingStyle}</span>
            )}
            {player.bowlingStyle && (
              <span>Bowl: {player.bowlingStyle}</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Base Price
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {(player.basePrice / 10000000).toFixed(1)} Cr
          </p>
        </div>
      </div>

      {highestBid && player.status === "BIDDING_OPEN" && (
        <div className="mt-4 rounded-lg bg-emerald-900/20 p-3">
          <p className="text-xs uppercase tracking-wider text-emerald-400">
            Highest Bid
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-emerald-300">
              {(highestBid.amount / 10000000).toFixed(1)} Cr
            </span>
            <span className="text-sm text-emerald-400">
              {highestBid.teamName && (
                <span className="font-medium">{highestBid.teamName}</span>
              )}
              {highestBid.teamName && " · "}
              {highestBid.username}
            </span>
          </div>
        </div>
      )}

      {player.status === "SOLD" && player.soldPrice && (
        <div className="mt-4 rounded-lg bg-amber-900/20 p-3">
          <p className="text-xs uppercase tracking-wider text-amber-400">
            Sold
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums text-amber-300">
              {(player.soldPrice / 10000000).toFixed(1)} Cr
            </span>
            {soldTeam && (
              <span className="text-sm text-amber-400">
                to {soldTeam.name}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <span>
          Player {currentIndex + 1} of {potPlayers.length}
        </span>
        <span>|</span>
        <span>Pot: {player.pot}</span>
      </div>
    </div>
  );
}
