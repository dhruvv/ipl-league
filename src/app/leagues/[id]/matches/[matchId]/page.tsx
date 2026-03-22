"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface Performance {
  id: string;
  playerId: string;
  playerName: string;
  position: string | null;
  country: string;
  iplTeam: string | null;
  teamId: string | null;
  teamName: string | null;
  runsScored: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  wicketsTaken: number;
  oversBowled: number;
  runsConceded: number;
  maidens: number;
  economyRate: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  fantasyPoints: number;
  isDuck: boolean;
  isOut: boolean;
}

interface MatchDetail {
  id: string;
  team1: string;
  team2: string;
  status: string;
  matchDate: string | null;
  performances: Performance[];
  teams: { id: string; name: string }[];
}

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string }>;
}) {
  const { id: leagueId, matchId } = use(params);
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "batting" | "bowling" | "fielding">(
    "all"
  );

  function loadMatch() {
    fetch(`/api/leagues/${leagueId}/matches/${matchId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setMatch(data))
      .catch((err) => console.error("[MatchDetail] Failed to load:", err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMatch();

    let es: EventSource | null = null;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      es = new EventSource(`/api/leagues/${leagueId}/scoring/stream`);
      es.addEventListener("score-update", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.matchId === matchId) loadMatch();
        } catch {
          /* skip malformed event */
        }
      });
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
  }, [leagueId, matchId]);

  if (loading || !match) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading match...</p>
      </div>
    );
  }

  const batsmen = match.performances.filter((p) => p.ballsFaced > 0);
  const bowlers = match.performances.filter((p) => p.oversBowled > 0);
  const fielders = match.performances.filter(
    (p) => p.catches > 0 || p.stumpings > 0 || p.runOuts > 0
  );

  const displayed =
    tab === "batting"
      ? batsmen
      : tab === "bowling"
        ? bowlers
        : tab === "fielding"
          ? fielders
          : match.performances;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}/matches`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          &larr; All Matches
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {match.team1} vs {match.team2}
          </h1>
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
        {match.matchDate && (
          <p className="text-sm text-gray-500">
            {new Date(match.matchDate).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "batting", "bowling", "fielding"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">No performance data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-left text-gray-400">
              <tr>
                <th className="p-3 font-medium">Player</th>
                <th className="p-3 font-medium">Team</th>
                {(tab === "all" || tab === "batting") && (
                  <>
                    <th className="p-3 font-medium text-right">R</th>
                    <th className="p-3 font-medium text-right">B</th>
                    <th className="p-3 font-medium text-right">4s</th>
                    <th className="p-3 font-medium text-right">6s</th>
                    <th className="p-3 font-medium text-right">SR</th>
                  </>
                )}
                {(tab === "all" || tab === "bowling") && (
                  <>
                    <th className="p-3 font-medium text-right">W</th>
                    <th className="p-3 font-medium text-right">O</th>
                    <th className="p-3 font-medium text-right">RC</th>
                    <th className="p-3 font-medium text-right">Eco</th>
                  </>
                )}
                {(tab === "all" || tab === "fielding") && (
                  <>
                    <th className="p-3 font-medium text-right">Ct</th>
                    <th className="p-3 font-medium text-right">St</th>
                    <th className="p-3 font-medium text-right">RO</th>
                  </>
                )}
                <th className="p-3 font-medium text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {displayed.map((p) => (
                <tr key={p.id} className="hover:bg-gray-800/30">
                  <td className="p-3">
                    <div className="font-medium">{p.playerName}</div>
                    <div className="text-xs text-gray-500">
                      {p.position} &middot;{" "}
                      {p.country !== "India" ? (
                        <span className="text-amber-400">{p.country}</span>
                      ) : (
                        p.country
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-gray-700 px-2 py-0.5 text-xs">
                      {p.teamName ?? "Unsold"}
                    </span>
                  </td>
                  {(tab === "all" || tab === "batting") && (
                    <>
                      <td className="p-3 text-right tabular-nums">
                        {p.runsScored}
                        {p.isDuck && (
                          <span className="ml-1 text-red-400">*</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.ballsFaced}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.fours}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.sixes}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.strikeRate.toFixed(1)}
                      </td>
                    </>
                  )}
                  {(tab === "all" || tab === "bowling") && (
                    <>
                      <td className="p-3 text-right tabular-nums">
                        {p.wicketsTaken}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.oversBowled}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.runsConceded}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.economyRate.toFixed(1)}
                      </td>
                    </>
                  )}
                  {(tab === "all" || tab === "fielding") && (
                    <>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.catches}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.stumpings}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-400">
                        {p.runOuts}
                      </td>
                    </>
                  )}
                  <td className="p-3 text-right">
                    <span className="font-bold tabular-nums text-emerald-400">
                      {p.fantasyPoints}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
