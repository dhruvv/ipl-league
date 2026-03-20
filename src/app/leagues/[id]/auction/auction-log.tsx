"use client";

import type { SoldEntry } from "./auction-view";

interface AuctionLogProps {
  soldLog: SoldEntry[];
}

export function AuctionLog({ soldLog }: AuctionLogProps) {
  const reversed = [...soldLog].reverse();

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-300">
        Auction Log ({soldLog.length})
      </h3>
      <div className="max-h-60 space-y-1 overflow-y-auto">
        {reversed.map((entry) => (
          <div
            key={entry.playerId}
            className="flex items-center justify-between rounded px-3 py-1.5 text-sm text-emerald-400"
          >
            <span>
              <span className="font-medium">{entry.playerName}</span>
              <span className="text-gray-500"> sold to </span>
              <span className="font-medium">{entry.teamName}</span>
            </span>
            <span className="tabular-nums">
              {((entry.soldPrice ?? 0) / 10000000).toFixed(1)} Cr
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
