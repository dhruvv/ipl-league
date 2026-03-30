"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Composition = {
  mode: "match_points_plus_xi" | "local_scorecard_plus_xi" | "unknown";
  cricketDataMatchPoints: number | null;
  cricketDataCountsTowardStored: boolean;
  appPlayingXiBonus: number;
  appLocalRulesSubtotal: number;
  referenceBreakdownCaption: string;
};

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
  threeCatchBonusAwarded?: number;
  totalCatchesInMatch?: number;
  explainedTotal: number;
  usesCricApiEngine: boolean;
  composition: Composition;
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
      srBonus: number;
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
      lbwBowledBonus: number;
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
  viewerIsAdmin?: boolean;
  adminPerformance?: {
    adminFantasyAdjustment: number;
    autoFantasyBase: number | null;
    importSays: string;
  } | null;
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
      .then((json) => {
        const c = json.composition;
        if (!c) {
          json.composition = {
            mode: "unknown",
            cricketDataMatchPoints: json.cricapiMatchPointsTotal ?? null,
            cricketDataCountsTowardStored: Boolean(json.usesCricApiEngine),
            appPlayingXiBonus: json.playingXiPointsAwarded ?? 0,
            appLocalRulesSubtotal: json.localSubtotal ?? 0,
            referenceBreakdownCaption:
              "Line items from merged league rules and the scorecard.",
          };
        }
        setData(json);
      })
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

  const threeCatchBonus = data.threeCatchBonusAwarded ?? 0;
  const totalCatches = data.totalCatchesInMatch ?? 0;

  const c = data.composition;
  const apiTotal = c.cricketDataMatchPoints;
  const xi = c.appPlayingXiBonus;
  const localSub = c.appLocalRulesSubtotal;

  const formulaLine =
    c.mode === "match_points_plus_xi" && apiTotal != null
      ? `${apiTotal} (CricketData match_points) + ${xi} (in-app playing-XI / on-scorecard bonus)`
      : c.mode === "local_scorecard_plus_xi"
        ? `${localSub} (in-app rules on scorecard) + ${xi} (playing-XI bonus)`
        : "Configure CricAPI and mapping to see the full formula.";

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
      {data.viewerIsAdmin && (
        <p className="mt-2">
          <Link
            href={`/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}/edit`}
            className="text-sm font-medium text-amber-400/95 hover:text-amber-300"
          >
            Edit stored stats & manual adjustment →
          </Link>
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-900/50 bg-sky-950/25 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400/90 mb-1">
            From CricketData
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            <code className="text-gray-400">match_points</code> — one total per
            player from their fantasy ruleset. No per-rule JSON in the API.
          </p>
          {apiTotal != null ? (
            <p className="text-2xl font-bold tabular-nums text-sky-200">
              {apiTotal}
              {c.cricketDataCountsTowardStored && (
                <span className="ml-2 text-xs font-normal text-sky-400/80">
                  counts toward stored
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Not loaded or not used (
              <code className="text-gray-400">FANTASY_POINTS_LOCAL_ONLY</code>,
              missing ruleset, or API error).
            </p>
          )}
        </div>

        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400/90 mb-1">
            Added in this app
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Not part of CricketData&apos;s{" "}
            <code className="text-gray-400">match_points</code> response —
            calculated here from league rules + scorecard presence.
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Playing-XI / on-scorecard bonus</span>
              <span className="tabular-nums font-medium text-amber-100">
                {xi === 0 ? "—" : `+${xi}`}
              </span>
            </div>
            {c.mode === "local_scorecard_plus_xi" && (
              <div className="flex justify-between gap-4 border-t border-amber-900/30 pt-2">
                <span className="text-gray-400">
                  Full in-app total (rules × scorecard)
                </span>
                <span className="tabular-nums font-medium text-amber-100">
                  {localSub} + {xi} bonus
                </span>
              </div>
            )}
            {c.mode === "match_points_plus_xi" && (
              <p className="text-xs text-gray-500 pt-1">
                Aside from this bonus, nothing else is layered on top of{" "}
                <code className="text-gray-400">match_points</code> for stored
                points.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/80 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
          Stored total (reconstructed)
        </h2>
        <div className="space-y-1">
          {data.storedFantasyPoints != null &&
            row("Actually stored in database", data.storedFantasyPoints)}
          {data.adminPerformance &&
            data.adminPerformance.adminFantasyAdjustment !== 0 && (
              <div className="flex justify-between gap-4 py-1 text-sm">
                <span className="text-gray-400">
                  Admin manual adjustment (always added after auto-import)
                </span>
                <span className="tabular-nums text-amber-200">
                  {data.adminPerformance.adminFantasyAdjustment > 0 ? "+" : ""}
                  {data.adminPerformance.adminFantasyAdjustment}
                </span>
              </div>
            )}
          <div className="rounded-lg bg-gray-800/50 px-3 py-2 text-sm text-gray-300 mt-2">
            <span className="text-gray-500">Formula · </span>
            {formulaLine}
          </div>
          <div className="flex justify-between gap-4 border-t border-gray-800 pt-2 mt-3 text-sm font-medium">
            <span className="text-gray-300">Reconstructed total</span>
            <span className="tabular-nums text-emerald-400">
              {data.explainedTotal}
            </span>
          </div>
        </div>
      </div>

      {(data.batting.length > 0 ||
        data.bowling.length > 0 ||
        data.fielding.length > 0 ||
        threeCatchBonus !== 0 ||
        totalCatches >= 3) && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-white mb-1">
            Line-by-line from in-app rules + scorecard
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {c.referenceBreakdownCaption}
          </p>
        </section>
      )}

      {data.batting.length > 0 && (
        <section className="mt-2">
          <h3 className="text-base font-medium text-gray-300 mb-2">Batting</h3>
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
              {row(
                "Strike rate penalty (slow SR)",
                b.breakdown.srPenalty ?? 0
              )}
              {row(
                "Strike rate bonus (fast SR)",
                b.breakdown.srBonus ?? 0
              )}
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
          <h3 className="text-base font-medium text-gray-300 mb-2">Bowling</h3>
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
              {row(
                "Wicket haul bonus (3w / 4w / 5w, best tier)",
                b.breakdown.milestone
              )}
              {row("LBW / bowled bonus", b.breakdown.lbwBowledBonus ?? 0)}
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
          <h3 className="text-base font-medium text-gray-300 mb-2">Fielding</h3>
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

      {(threeCatchBonus !== 0 || totalCatches >= 3) && (
        <section className="mt-8">
          <h3 className="text-base font-medium text-gray-300 mb-2">
            Match fielding bonus
          </h3>
          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-sm">
            <p className="text-xs text-gray-500 mb-2">
              Total catches credited to this player on the scorecard:{" "}
              {totalCatches} (regular + C&B). One-time bonus when this total is 3
              or more (per league rules; default +4).
            </p>
            {row("3+ catches bonus", threeCatchBonus)}
          </div>
        </section>
      )}

      {data.batting.length === 0 &&
        data.bowling.length === 0 &&
        data.fielding.length === 0 &&
        !(threeCatchBonus !== 0 || totalCatches >= 3) && (
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
