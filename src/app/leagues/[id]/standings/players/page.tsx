"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface ByMatch {
  matchId: string;
  label: string;
  points: number;
}

interface PlayerRow {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  totalPoints: number;
  matchCount: number;
  byMatch: ByMatch[];
}

export default function PlayerStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = use(params);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/standings/players`)
      .then((r) => r.json())
      .then((data) => {
        setPlayers(data.players ?? []);
        setMatchCount(data.matchCount ?? 0);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading player points...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}/standings`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          &larr; Team leaderboard
        </Link>
        <Link
          href={`/leagues/${leagueId}`}
          className="ml-4 text-sm text-indigo-400 hover:text-indigo-300"
        >
          League home
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Player fantasy totals</h1>
        <p className="text-sm text-gray-400">
          Sum of fantasy points across {matchCount} scored match
          {matchCount !== 1 ? "es" : ""} (every player’s performances). The
          main team leaderboard uses only the top N players per team by
          season total.
        </p>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No performance data yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {players.map((p, rank) => (
            <div
              key={p.playerId}
              className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setExpanded(
                    expanded === p.playerId ? null : p.playerId
                  )
                }
                className="flex w-full items-center gap-4 p-4 text-left hover:bg-gray-800/50 transition"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold bg-gray-700 text-gray-300">
                  {rank + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{p.playerName}</div>
                  <div className="text-xs text-gray-500">
                    {p.teamName ?? "Unsold"} &middot; {p.matchCount} match
                    {p.matchCount !== 1 ? "es" : ""}
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums text-emerald-400">
                  {p.totalPoints}
                </span>
              </button>
              {expanded === p.playerId && p.byMatch.length > 0 && (
                <div className="border-t border-gray-800 px-4 pb-4">
                  <div className="space-y-1 pt-3 text-sm">
                    {p.byMatch.map((m) => (
                      <div
                        key={m.matchId}
                        className="flex justify-between gap-2 text-gray-400"
                      >
                        <Link
                          href={`/leagues/${leagueId}/matches/${m.matchId}`}
                          className="truncate text-indigo-400 hover:text-indigo-300"
                        >
                          {m.label}
                        </Link>
                        <span className="tabular-nums text-emerald-400 shrink-0">
                          {m.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
