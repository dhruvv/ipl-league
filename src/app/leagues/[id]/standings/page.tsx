"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface PlayerSeason {
  name: string;
  points: number;
}

interface TeamStanding {
  teamId: string;
  teamName: string;
  totalPoints: number;
  playerCount: number;
  countingPlayers: PlayerSeason[];
  benchPlayers: PlayerSeason[];
}

export default function StandingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = use(params);
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [scoringTopN, setScoringTopN] = useState(7);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  function loadStandings() {
    fetch(`/api/leagues/${leagueId}/standings`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setStandings(data.standings ?? []);
        setScoringTopN(data.scoringTopN ?? 7);
        setMatchCount(data.matchCount ?? 0);
      })
      .catch((err) => console.error("[Standings] Failed to load:", err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStandings();

    let es: EventSource | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      es = new EventSource(`/api/leagues/${leagueId}/scoring/stream`);
      es.addEventListener("score-update", () => loadStandings());
      es.addEventListener("match-completed", () => loadStandings());
      es.onopen = () => { retryDelay = 1000; };
      es.onerror = () => {
        es?.close();
        if (!disposed) {
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading standings...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          &larr; Back to League
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Leaderboard</h1>
        <p className="text-sm text-gray-400">
          Top {scoringTopN} players per team by season fantasy points count
          toward the team total &middot; {matchCount} match
          {matchCount !== 1 ? "es" : ""} scored. Bench players are listed but
          excluded from the total.
        </p>
        <Link
          href={`/leagues/${leagueId}/standings/players`}
          className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300"
        >
          Player fantasy totals (match-by-match) →
        </Link>
      </div>

      {standings.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">
            No standings yet. Matches need to be synced and scored.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {standings.map((team, rank) => (
            <div
              key={team.teamId}
              className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
            >
              <button
                onClick={() =>
                  setExpanded(
                    expanded === team.teamId ? null : team.teamId
                  )
                }
                className="flex w-full items-center gap-4 p-4 text-left hover:bg-gray-800/50 transition"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    rank === 0
                      ? "bg-amber-500 text-black"
                      : rank === 1
                        ? "bg-gray-400 text-black"
                        : rank === 2
                          ? "bg-amber-700 text-white"
                          : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {rank + 1}
                </span>
                <div className="flex-1">
                  <span className="font-semibold">{team.teamName}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {team.playerCount} players
                  </span>
                </div>
                <span className="text-lg font-bold tabular-nums text-emerald-400">
                  {team.totalPoints}
                </span>
                <span className="text-gray-500 text-xs">pts</span>
              </button>

              {expanded === team.teamId &&
                team.countingPlayers.length > 0 && (
                  <div className="border-t border-gray-800 px-4 pb-4">
                    <h4 className="pt-3 pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Counting (Top {scoringTopN})
                    </h4>
                    <div className="space-y-1">
                      {team.countingPlayers.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
                        >
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-sm font-bold tabular-nums text-emerald-400">
                            {p.points} pts
                          </span>
                        </div>
                      ))}
                    </div>
                    {team.benchPlayers.length > 0 && (
                      <>
                        <h4 className="pt-3 pb-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Bench (not counting)
                        </h4>
                        <div className="space-y-1">
                          {team.benchPlayers.map((p, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg bg-gray-800/30 px-3 py-2"
                            >
                              <span className="text-sm text-gray-400">{p.name}</span>
                              <span className="text-sm tabular-nums text-gray-500">
                                {p.points} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
