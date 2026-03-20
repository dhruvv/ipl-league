"use client";

import { useState } from "react";
import type { AuctionPlayer, BidEntry, BudgetInfo } from "./auction-view";

interface BidPanelProps {
  leagueId: string;
  currentPlayer: AuctionPlayer;
  highestBid: BidEntry | null;
  myBudget: BudgetInfo | null;
  overseasCap: number;
}

const QUICK_INCREMENTS = [
  { label: "+5L", value: 500000 },
  { label: "+10L", value: 1000000 },
  { label: "+25L", value: 2500000 },
  { label: "+50L", value: 5000000 },
];

export function BidPanel({
  leagueId,
  currentPlayer,
  highestBid,
  myBudget,
  overseasCap,
}: BidPanelProps) {
  const minBid = highestBid
    ? highestBid.amount + 100000
    : currentPlayer.basePrice;

  const [amount, setAmount] = useState(minBid);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isOverseas = currentPlayer.country !== "India";
  const atOverseasCap =
    isOverseas && myBudget ? myBudget.overseasCount >= overseasCap : false;
  const overBudget = myBudget ? amount > myBudget.remaining : false;
  const canBid = !atOverseasCap && !overBudget && amount >= minBid;

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
        setAmount(amount + 100000);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-300">Place a Bid</h3>

      {error && (
        <div className="mb-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {atOverseasCap && (
        <div className="mb-3 rounded bg-amber-900/50 px-3 py-2 text-sm text-amber-300">
          Overseas cap reached ({myBudget?.overseasCount}/{overseasCap}).
          Cannot bid on overseas players.
        </div>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            htmlFor="bidAmount"
            className="block text-xs text-gray-500"
          >
            Amount (min: {minBid.toLocaleString()})
          </label>
          <input
            id="bidAmount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            min={minBid}
            step={100000}
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
        {QUICK_INCREMENTS.map((inc) => {
          const newAmount = (highestBid?.amount ?? currentPlayer.basePrice) + inc.value;
          return (
            <button
              key={inc.label}
              onClick={() => setAmount(newAmount)}
              className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
            >
              {inc.label} ({newAmount.toLocaleString()})
            </button>
          );
        })}
      </div>

      {myBudget && (
        <div className="mt-3 flex gap-4 text-xs text-gray-500">
          <span>Budget: {myBudget.remaining.toLocaleString()}</span>
          <span>
            Overseas: {myBudget.overseasCount}/{overseasCap}
          </span>
          {overBudget && (
            <span className="text-red-400">Over budget!</span>
          )}
        </div>
      )}
    </div>
  );
}
