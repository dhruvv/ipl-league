"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface LeagueActionsProps {
  leagueId: string;
  phase: string;
  isAdmin: boolean;
}

export function LeagueActions({ leagueId, phase, isAdmin }: LeagueActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [syncResult, setSyncResult] = useState("");

  async function transitionPhase(targetPhase: string) {
    setLoading("phase");
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/phase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: targetPhase }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to transition phase");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function syncMatches() {
    if (!seriesId.trim()) {
      setError("Enter a CricAPI series ID");
      return;
    }
    setLoading("sync");
    setError("");
    setSyncResult("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/matches/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId: seriesId.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          `Synced "${data.seriesName}": ${data.created} new, ${data.skipped} existing`
        );
        router.refresh();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {(phase === "LEAGUE_ACTIVE" || phase === "LEAGUE_COMPLETE") && (
          <>
            <Link
              href={`/leagues/${leagueId}/standings`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Leaderboard
            </Link>
            <Link
              href={`/leagues/${leagueId}/matches`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Matches
            </Link>
          </>
        )}

        {isAdmin && phase === "AUCTION_COMPLETE" && (
          <button
            onClick={() => transitionPhase("LEAGUE_ACTIVE")}
            disabled={loading !== null}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading === "phase" ? "Starting..." : "Start League Phase"}
          </button>
        )}

        {isAdmin && phase === "LEAGUE_ACTIVE" && (
          <button
            onClick={() => transitionPhase("LEAGUE_COMPLETE")}
            disabled={loading !== null}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600 disabled:opacity-50"
          >
            {loading === "phase" ? "Ending..." : "End League"}
          </button>
        )}

        {isAdmin && (phase === "AUCTION_COMPLETE" || phase === "LEAGUE_ACTIVE") && (
          <Link
            href={`/leagues/${leagueId}/players/map`}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-600"
          >
            Map Players to CricAPI
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {isAdmin && (phase === "AUCTION_COMPLETE" || phase === "LEAGUE_ACTIVE") && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-300">Sync Matches</h3>
          <p className="mt-1 text-xs text-gray-500">
            Enter the CricAPI series ID (from cricketdata.org) to import
            matches for scoring.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
              placeholder="e.g. d4cce251-28c0-..."
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={syncMatches}
              disabled={loading !== null}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading === "sync" ? "Syncing..." : "Sync"}
            </button>
          </div>
          {syncResult && (
            <p className="mt-2 text-sm text-emerald-400">{syncResult}</p>
          )}
        </div>
      )}
    </div>
  );
}
