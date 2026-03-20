"use client";

import { useState } from "react";
import type { AuctionPlayer, BidEntry, TeamBudgetInfo } from "./auction-view";

interface BidPanelProps {
  leagueId: string;
  currentPlayer: AuctionPlayer;
  highestBid: BidEntry | null;
  myTeamBudget: TeamBudgetInfo | null;
  myTeamName: string | null;
  overseasCap: number;
  minBidIncrement: number;
}

export function BidPanel({
  leagueId,
  currentPlayer,
  highestBid,
  myTeamBudget,
  myTeamName,
  overseasCap,
  minBidIncrement,
}: BidPanelProps) {
  const minBid = highestBid
    ? highestBid.amount + minBidIncrement
    : currentPlayer.basePrice;

  const [amount, setAmount] = useState(minBid);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!myTeamBudget) {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-4 text-sm text-amber-300">
        You must join a team before you can bid. Go to the league page to create or join a team.
      </div>
    );
  }

  const isOverseas = currentPlayer.country !== "India";
  const atOverseasCap = isOverseas && myTeamBudget.overseasCount >= overseasCap;
  const overBudget = amount > myTeamBudget.remaining;
  const canBid = !atOverseasCap && !overBudget && amount >= minBid;

  const incLabel = (n: number) => {
    const cr = (n * minBidIncrement) / 10000000;
    return cr >= 1 ? `+${cr} Cr` : `+${(n * minBidIncrement) / 100000}L`;
  };

  const quickBids = [1, 2, 5, 10].map((mult) => ({
    label: incLabel(mult),
    value: (highestBid?.amount ?? currentPlayer.basePrice) + mult * minBidIncrement,
  }));

  async function placeBid() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/auction/${leagueId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Bid failed");
      } else {
        setAmount(amount + minBidIncrement);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Place a Bid</h3>
        {myTeamName && (
          <span className="rounded bg-indigo-900/50 px-2 py-0.5 text-xs text-indigo-300">
            {myTeamName}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {atOverseasCap && (
        <div className="mb-3 rounded bg-amber-900/50 px-3 py-2 text-sm text-amber-300">
          Overseas cap reached ({myTeamBudget.overseasCount}/{overseasCap}).
          Cannot bid on overseas players.
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="bidAmount"
            className="block text-xs text-gray-500"
          >
            Amount (min: {(minBid / 10000000).toFixed(1)} Cr)
          </label>
          <input
            id="bidAmount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={minBid}
            step={minBidIncrement}
            className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-gray-100 tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={placeBid}
          disabled={!canBid || loading}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {loading ? "Bidding..." : "Bid"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickBids.map((qb) => (
          <button
            key={qb.label}
            onClick={() => setAmount(qb.value)}
            className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
          >
            {qb.label} ({(qb.value / 10000000).toFixed(1)} Cr)
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <span>
          Team Budget: {(myTeamBudget.remaining / 10000000).toFixed(1)} Cr
        </span>
        <span>
          Overseas: {myTeamBudget.overseasCount}/{overseasCap}
        </span>
        <span>Players: {myTeamBudget.playerCount}</span>
        {overBudget && (
          <span className="text-red-400">Over budget!</span>
        )}
      </div>
    </div>
  );
}
