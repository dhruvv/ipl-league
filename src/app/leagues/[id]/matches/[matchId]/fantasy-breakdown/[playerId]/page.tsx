"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type BreakdownApi = {
  leagueName: string;
  match: {
    id: string;
    team1: string;
    team2: string;
    status: string;
    matchDate: string | null;
  };
  player: {
    id: string;
    name: string;
    position: string | null;
    externalId: string | null;
  };
  storedFantasyPoints: number | null;
  cricapiMatchPointsTotal: number | null;
  localSubtotal: number;
  playingXiPointsAwarded: number;
  explainedTotal: number;
  usesCricApiEngine: boolean;
  batting: {
    inning: string;
    name: string;
    breakdown: {
      runs: number;
      fours: number;
      sixes: number;
      milestone: number;
      duck: number;
      srPenalty: number;
      total: number;
    };
    r: number;
    b: number;
    fours: number;
    sixes: number;
    sr: number;
    dismissal: string;
  }[];
  bowling: {
    inning: string;
    name: string;
    breakdown: {
      wickets: number;
      maidens: number;
      milestone: number;
      ecoBonus: number;
      total: number;
    };
    o: number;
    m: number;
    r: number;
    w: number;
    eco: number;
  }[];
  fielding: {
    inning: string;
    name: string;
    breakdown: {
      catches: number;
      caughtAndBowled: number;
      stumpings: number;
      runouts: number;
      total: number;
    };
    catch: number;
    cb: number;
    stumpings: number;
    runouts: number;
  }[];
  notes: string[];
};

export default function FantasyBreakdownPage({
  params,
}: {
  params: Promise<{ id: string; matchId: string; playerId: string }>;
}) {
  const { id: leagueId, matchId, playerId } = use(params);
  const [data, setData] = useState<BreakdownApi | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(
      `/api/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}`
    )
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(
            typeof j.error === "string" ? j.error : `HTTP ${r.status}`
          );
        }
        return r.json();
      })
      .then(setData)
      .catch((e) =>
        setErr(e instanceof Error ? e.message : "Failed to load breakdown")
      );
  }, [leagueId, matchId, playerId]);

  if (err) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-red-400">{err}</p>
        <Link
          href={`/leagues/${leagueId}/matches/${matchId}`}
          className="mt-4 inline-block text-sm text-indigo-400"
        >
          &larr; Back to match
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-gray-400">
        Loading breakdown…
      </div>
    );
  }

  const row = (label: string, pts: number) => (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className="tabular-nums text-gray-200">{pts}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      <p className="text-xs text-gray-500 mb-2">
        Unlisted route · not in main navigation
      </p>
      <Link
        href={`/leagues/${leagueId}/matches/${matchId}`}
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        &larr; {data.match.team1} vs {data.match.team2}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-white">
        Fantasy breakdown · {data.player.name}
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        {data.leagueName} · {data.player.position ?? "—"} · CricAPI id:{" "}
        {data.player.externalId ?? "not mapped"}
      </p>

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/80 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-3">
          Stored &amp; engine
        </h2>
        <div className="space-y-1">
          {data.storedFantasyPoints != null &&
            row("Stored in database", data.storedFantasyPoints)}
          {data.cricapiMatchPointsTotal != null &&
            row("CricketData match_points (ruleset)", data.cricapiMatchPointsTotal)}
          {row(
            "Local scorecard subtotal (bat + bowl + field)",
            data.localSubtotal
          )}
          {data.playingXiPointsAwarded !== 0 &&
            row("Playing-XI / on-scorecard bonus", data.playingXiPointsAwarded)}
          <div className="flex justify-between gap-4 border-t border-gray-800 pt-2 mt-2 text-sm font-medium">
            <span className="text-gray-300">Reconstructed total</span>
            <span className="tabular-nums text-emerald-400">
              {data.explainedTotal}
            </span>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {data.usesCricApiEngine
            ? "Reconstructed total = match_points + playing-XI add-on."
            : "Reconstructed total = local scorecard math + playing-XI add-on (API unavailable or FANTASY_POINTS_LOCAL_ONLY)."}
        </p>
      </div>

      {data.batting.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-2">Batting</h2>
          {data.batting.map((b, i) => (
            <div
              key={`${b.inning}-${i}`}
              className="mb-4 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
            >
              <p className="text-xs text-gray-500 mb-2">
                {b.inning} · {b.r}/{b.b} · 4s {b.fours} · 6s {b.sixes} · SR{" "}
                {b.sr.toFixed(1)} · {b.dismissal || "not out"}
              </p>
              {row("Runs", b.breakdown.runs)}
              {row("Fours", b.breakdown.fours)}
              {row("Sixes", b.breakdown.sixes)}
              {row("50 / 100", b.breakdown.milestone)}
              {row("Duck", b.breakdown.duck)}
              {row("Strike rate tier", b.breakdown.srPenalty)}
              <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 text-sm font-medium">
                <span>Innings batting</span>
                <span className="tabular-nums text-emerald-300">
                  {b.breakdown.total}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.bowling.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-2">Bowling</h2>
          {data.bowling.map((b, i) => (
            <div
              key={`${b.inning}-bowl-${i}`}
              className="mb-4 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
            >
              <p className="text-xs text-gray-500 mb-2">
                {b.inning} · {b.o}-{b.m}-{b.r}-{b.w} · eco {b.eco.toFixed(2)}
              </p>
              {row("Wickets", b.breakdown.wickets)}
              {row("Maidens", b.breakdown.maidens)}
              {row("4w / 5w bonus", b.breakdown.milestone)}
              {row("Economy tier", b.breakdown.ecoBonus)}
              <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 text-sm font-medium">
                <span>Spell</span>
                <span className="tabular-nums text-emerald-300">
                  {b.breakdown.total}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.fielding.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-2">Fielding</h2>
          {data.fielding.map((f, i) => (
            <div
              key={`${f.inning}-cat-${i}`}
              className="mb-4 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
            >
              <p className="text-xs text-gray-500 mb-2">
                {f.inning} · ct {f.catch} · cb {f.cb} · st {f.stumpings} · ro{" "}
                {f.runouts}
              </p>
              {row("Catch points (incl. C&B weighting)", f.breakdown.catches)}
              {row("Stumpings", f.breakdown.stumpings)}
              {row("Run-outs", f.breakdown.runouts)}
              <div className="flex justify-between border-t border-gray-800 pt-2 mt-1 text-sm font-medium">
                <span>Fielding block</span>
                <span className="tabular-nums text-emerald-300">
                  {f.breakdown.total}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.batting.length === 0 &&
        data.bowling.length === 0 &&
        data.fielding.length === 0 && (
          <p className="mt-8 text-gray-400 text-sm">
            No scorecard lines for this player yet, or mapping/scorecard is
            missing.
          </p>
        )}

      {data.notes.length > 0 && (
        <div className="mt-8 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-amber-100/90">
          <ul className="list-disc space-y-1 pl-4">
            {data.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
