"use client";

import type { AuctionPlayer } from "./auction-view";

interface UpcomingPlayersProps {
  players: AuctionPlayer[];
}

export function UpcomingPlayers({ players }: UpcomingPlayersProps) {
  if (players.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-400">
        Coming Up Next
      </h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {players.map((p, i) => (
          <div
            key={p.id}
            className="flex-shrink-0 rounded-lg border border-gray-700/50 bg-gray-800/50 px-3 py-2"
            style={{ minWidth: "140px" }}
          >
            <p className="truncate text-sm font-medium">{p.name}</p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
              {p.position && <span>{p.position}</span>}
              {p.position && p.country && <span>·</span>}
              <span className={p.country !== "India" ? "text-amber-400" : ""}>
                {p.country !== "India" ? "OS" : "IND"}
              </span>
            </div>
            <p className="mt-1 text-xs tabular-nums text-gray-500">
              {(p.basePrice / 10000000).toFixed(1)} Cr
            </p>
            <p className="mt-0.5 text-[10px] text-gray-600">#{i + 1}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
