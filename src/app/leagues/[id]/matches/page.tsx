"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface MatchEntry {
  id: string;
  externalMatchId: string;
  team1: string;
  team2: string;
  status: string;
  matchDate: string | null;
  _count: { performances: number };
}

export default function MatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = use(params);
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/matches`)
      .then((r) => r.json())
      .then((data) => setMatches(data.matches ?? []))
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading matches...</p>
      </div>
    );
  }

  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const completed = matches.filter((m) => m.status === "COMPLETED");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          &larr; Back to League
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Matches</h1>
        <p className="text-sm text-gray-400">
          {matches.length} match{matches.length !== 1 ? "es" : ""} synced
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">
            No matches synced yet. An admin needs to sync matches from CricAPI.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {live.length > 0 && (
            <MatchSection title="Live" matches={live} leagueId={leagueId} />
          )}
          {upcoming.length > 0 && (
            <MatchSection
              title="Upcoming"
              matches={upcoming}
              leagueId={leagueId}
            />
          )}
          {completed.length > 0 && (
            <MatchSection
              title="Completed"
              matches={completed}
              leagueId={leagueId}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MatchSection({
  title,
  matches,
  leagueId,
}: {
  title: string;
  matches: MatchEntry[];
  leagueId: string;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-gray-400 uppercase tracking-wider">
        {title}
      </h2>
      <div className="space-y-2">
        {matches.map((match) => (
          <Link
            key={match.id}
            href={`/leagues/${leagueId}/matches/${match.id}`}
            className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-4 transition hover:border-gray-700 hover:bg-gray-800/50"
          >
            <div className="flex-1">
              <div className="font-medium">
                {match.team1} vs {match.team2}
              </div>
              {match.matchDate && (
                <div className="mt-0.5 text-xs text-gray-500">
                  {new Date(match.matchDate).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {match._count.performances > 0 && (
                <span className="text-xs text-gray-500">
                  {match._count.performances} players scored
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  match.status === "LIVE"
                    ? "bg-red-900/50 text-red-400 animate-pulse"
                    : match.status === "COMPLETED"
                      ? "bg-emerald-900/50 text-emerald-400"
                      : "bg-gray-700 text-gray-400"
                }`}
              >
                {match.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
