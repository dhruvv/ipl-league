"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface SquadPlayer {
  externalId: string;
  name: string;
  country: string;
  mappedLeaguePlayerId: string | null;
  mappedLeaguePlayerName: string | null;
  appearedInScorecard: boolean;
}

interface SquadBlock {
  teamName: string;
  shortname: string;
  players: SquadPlayer[];
}

interface MatchSquads {
  leagueMatchId: string;
  externalMatchId: string;
  team1: string;
  team2: string;
  status: string;
  matchDate: string | null;
  note: string | null;
  squads: SquadBlock[];
}

export default function TodaysSquadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = use(params);
  const [calendarDate, setCalendarDate] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [matches, setMatches] = useState<MatchSquads[]>([]);
  const [loading, setLoading] = useState(true);
  const HIGHLIGHT_MIN = 11;

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/squads/today`)
      .then((r) => r.json())
      .then((data) => {
        setCalendarDate(data.calendarDate ?? "");
        setTimeZone(data.timeZone ?? "");
        setMatches(data.matches ?? []);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading squads...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          &larr; Back to League
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Today&apos;s squads</h1>
        <p className="text-sm text-gray-400">
          {calendarDate}
          {timeZone ? ` (${timeZone})` : ""} &middot; Full IPL squads from CricAPI;
          after the match starts, players on the scorecard are highlighted.
        </p>
        <Link
          href={`/leagues/${leagueId}/players/map`}
          className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300"
        >
          Map players to CricAPI →
        </Link>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">
            No matches scheduled for today in this time zone. Sync matches or
            check the schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {matches.map((m) => (
            <div
              key={m.leagueMatchId}
              className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden"
            >
              <div className="border-b border-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link
                    href={`/leagues/${leagueId}/matches/${m.leagueMatchId}`}
                    className="text-lg font-semibold text-indigo-400 hover:text-indigo-300"
                  >
                    {m.team1} vs {m.team2}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span
                      className={
                        m.status === "LIVE"
                          ? "text-red-400 font-medium"
                          : undefined
                      }
                    >
                      {m.status}
                    </span>
                    {m.matchDate && (
                      <span>
                        {new Date(m.matchDate).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    <span className="font-mono text-gray-600">
                      {m.externalMatchId}
                    </span>
                  </div>
                </div>
              </div>
              {m.note && (
                <p className="px-4 py-2 text-xs text-amber-200/90 bg-amber-950/30 border-b border-gray-800">
                  {m.note}
                </p>
              )}
              <div className="grid gap-4 p-4 md:grid-cols-2">
                {m.squads.map((s) => {
                  const highlighted = s.players.filter(
                    (p) => p.appearedInScorecard
                  );
                  const showXiHint =
                    highlighted.length >= HIGHLIGHT_MIN &&
                    highlighted.length <= 22;
                  return (
                    <div key={s.shortname} className="rounded-lg bg-gray-800/40 p-3">
                      <h3 className="font-medium text-gray-200">
                        {s.teamName}{" "}
                        <span className="text-gray-500 text-sm">
                          ({s.shortname})
                        </span>
                      </h3>
                      {showXiHint && (
                        <p className="mt-1 text-xs text-gray-500">
                          {highlighted.length} players on scorecard — likely
                          includes today&apos;s XI and used subs.
                        </p>
                      )}
                      <ul className="mt-2 max-h-72 overflow-y-auto space-y-1 text-sm">
                        {s.players.map((p) => (
                          <li
                            key={p.externalId}
                            className={`flex flex-wrap gap-x-2 ${p.appearedInScorecard ? "text-emerald-300" : "text-gray-400"}`}
                          >
                            <span>{p.name}</span>
                            {p.mappedLeaguePlayerName ? (
                              <span className="text-xs text-indigo-400">
                                → {p.mappedLeaguePlayerName}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-600">
                                unmapped
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
