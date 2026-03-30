"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type AdminPerformance = {
  stats: {
    runsScored: number;
    ballsFaced: number;
    fours: number;
    sixes: number;
    wicketsTaken: number;
    oversBowled: number;
    runsConceded: number;
    maidens: number;
    catches: number;
    stumpings: number;
    runOuts: number;
    dotBalls: number;
    strikeRate: number;
    economyRate: number;
    isDuck: boolean;
    isOut: boolean;
  };
  adminFantasyAdjustment: number;
  autoFantasyBase: number | null;
  importSays: "match_points" | "local_scorecard" | "unknown";
};

type BreakdownHead = {
  leagueName: string;
  viewerIsAdmin: boolean;
  adminPerformance: AdminPerformance | null;
  storedFantasyPoints: number | null;
  player: { id: string; name: string };
  match: { team1: string; team2: string };
};

type FormState = AdminPerformance["stats"] & {
  adminFantasyAdjustment: number;
};

const defaultForm: FormState = {
  runsScored: 0,
  ballsFaced: 0,
  fours: 0,
  sixes: 0,
  wicketsTaken: 0,
  oversBowled: 0,
  runsConceded: 0,
  maidens: 0,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  dotBalls: 0,
  strikeRate: 0,
  economyRate: 0,
  isDuck: false,
  isOut: false,
  adminFantasyAdjustment: 0,
};

export default function AdminEditPerformancePage({
  params,
}: {
  params: Promise<{ id: string; matchId: string; playerId: string }>;
}) {
  const { id: leagueId, matchId, playerId } = use(params);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [head, setHead] = useState<BreakdownHead | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [autoBase, setAutoBase] = useState<number | null>(null);
  const [importSays, setImportSays] = useState<string>("unknown");

  useEffect(() => {
    let cancelled = false;
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
      .then((j) => {
        if (cancelled) return;
        setHead({
          leagueName: j.leagueName,
          viewerIsAdmin: Boolean(j.viewerIsAdmin),
          adminPerformance: j.adminPerformance ?? null,
          storedFantasyPoints:
            j.storedFantasyPoints === null || j.storedFantasyPoints === undefined
              ? null
              : Number(j.storedFantasyPoints),
          player: j.player,
          match: j.match,
        });
        const ap = j.adminPerformance as AdminPerformance | null | undefined;
        if (ap) {
          setAutoBase(ap.autoFantasyBase);
          setImportSays(ap.importSays);
          setForm({
            ...ap.stats,
            adminFantasyAdjustment: ap.adminFantasyAdjustment,
          });
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, matchId, playerId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}/performance`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof j.error === "string" ? j.error : `HTTP ${res.status}`);
      }
      window.location.href = `/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function numField(
    label: string,
    key: keyof Omit<FormState, "isDuck" | "isOut" | "oversBowled" | "strikeRate" | "economyRate">
  ) {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-400">{label}</span>
        <input
          type="number"
          className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-white tabular-nums"
          value={form[key]}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              [key]: Number.parseInt(e.target.value, 10) || 0,
            }))
          }
        />
      </label>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-gray-400">
        Loading…
      </div>
    );
  }

  if (!head) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-red-400">
        {err ?? "Something went wrong."}
      </div>
    );
  }

  if (!head.viewerIsAdmin) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-amber-200">Only league owners and admins can edit stats.</p>
        <Link
          href={`/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}`}
          className="mt-4 inline-block text-sm text-indigo-400"
        >
          &larr; Back to breakdown
        </Link>
      </div>
    );
  }

  if (!head.adminPerformance && head.storedFantasyPoints == null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-gray-300">
          No performance row for this player in this match yet. Import the
          scorecard from the match page, then return here.
        </p>
        <Link
          href={`/leagues/${leagueId}/matches/${matchId}`}
          className="mt-4 inline-block text-sm text-indigo-400"
        >
          &larr; Match
        </Link>
      </div>
    );
  }

  const previewTotal =
    autoBase != null
      ? Math.round((autoBase + form.adminFantasyAdjustment) * 100) / 100
      : null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href={`/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}`}
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        &larr; Breakdown · {head.player.name}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-white">
        Edit match stats (admin)
      </h1>
      <p className="mt-1 text-sm text-gray-400">
        {head.leagueName} · {head.match.team1} vs {head.match.team2}
      </p>

      <div className="mt-6 rounded-lg border border-amber-900/40 bg-amber-950/20 p-4 text-sm text-amber-100/90">
        <p className="font-medium text-amber-200 mb-2">How this works</p>
        <ul className="list-disc space-y-1 pl-4 text-amber-100/85">
          <li>
            <strong className="text-amber-200">Manual adjustment</strong> is
            added on top of the automatic import total (CricketData{" "}
            <code className="text-gray-300">match_points</code> or local
            scorecard math + playing-XI). Use it when the feed is wrong (e.g.
            missing catch points). It is <strong>preserved</strong> when you
            re-import the scorecard.
          </li>
          <li>
            The stat columns below update what you see on the match page and in
            exports; they do not change CricketData&apos;s API total. For stored
            fantasy, rely on <strong>adjustment</strong> when the auto base is
            wrong.
          </li>
        </ul>
      </div>

      {importSays !== "unknown" && (
        <p className="mt-4 text-xs text-gray-500">
          Auto base source:{" "}
          <span className="text-gray-400">
            {importSays === "match_points"
              ? "CricketData match_points + playing-XI"
              : "In-app scorecard rules + playing-XI"}
          </span>
          {autoBase != null && (
            <>
              {" "}
              → <span className="tabular-nums text-gray-300">{autoBase}</span>
            </>
          )}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-8">
        <section>
          <h2 className="text-base font-semibold text-white mb-3">
            Fantasy adjustment
          </h2>
          <label className="flex flex-col gap-1 text-sm max-w-xs">
            <span className="text-gray-400">
              Manual points adjustment (can be negative)
            </span>
            <input
              type="number"
              step="0.01"
              className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-white tabular-nums"
              value={form.adminFantasyAdjustment}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  adminFantasyAdjustment: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          {previewTotal != null && (
            <p className="mt-2 text-sm text-gray-400">
              Stored total after save (auto base + adjustment):{" "}
              <span className="tabular-nums text-emerald-400 font-medium">
                {previewTotal}
              </span>
            </p>
          )}
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-3">Batting</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {numField("Runs", "runsScored")}
            {numField("Balls", "ballsFaced")}
            {numField("4s", "fours")}
            {numField("6s", "sixes")}
            {numField("Dot balls", "dotBalls")}
          </div>
          <label className="mt-3 flex flex-col gap-1 text-sm max-w-xs">
            <span className="text-gray-400">Strike rate (display)</span>
            <input
              type="number"
              step="0.01"
              className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-white tabular-nums"
              value={form.strikeRate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  strikeRate: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          <div className="mt-3 flex gap-6 text-sm">
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={form.isDuck}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isDuck: e.target.checked }))
                }
              />
              Duck
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={form.isOut}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isOut: e.target.checked }))
                }
              />
              Out
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-3">Bowling</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {numField("Wickets", "wicketsTaken")}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-400">Overs</span>
              <input
                type="number"
                step="0.1"
                className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-white tabular-nums"
                value={form.oversBowled}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    oversBowled: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
            {numField("Runs conceded", "runsConceded")}
            {numField("Maidens", "maidens")}
          </div>
          <label className="mt-3 flex flex-col gap-1 text-sm max-w-xs">
            <span className="text-gray-400">Economy (display)</span>
            <input
              type="number"
              step="0.01"
              className="rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-white tabular-nums"
              value={form.economyRate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  economyRate: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-3">Fielding</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {numField("Catches", "catches")}
            {numField("Stumpings", "stumpings")}
            {numField("Run-outs", "runOuts")}
          </div>
        </section>

        {err && (
          <p className="text-sm text-red-400" role="alert">
            {err}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <Link
            href={`/leagues/${leagueId}/matches/${matchId}/fantasy-breakdown/${playerId}`}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
