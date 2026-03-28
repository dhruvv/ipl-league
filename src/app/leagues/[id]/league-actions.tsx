"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface LeagueActionsProps {
  leagueId: string;
  phase: string;
  isAdmin: boolean;
  cricapiFantasyRulesetId: string | null;
}

export function LeagueActions({
  leagueId,
  phase,
  isAdmin,
  cricapiFantasyRulesetId: initialRulesetId,
}: LeagueActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [syncResult, setSyncResult] = useState("");
  const [fantasyRulesetId, setFantasyRulesetId] = useState(
    initialRulesetId ?? ""
  );
  const [rulesetSaveMsg, setRulesetSaveMsg] = useState("");
  const [seriesPageUrl, setSeriesPageUrl] = useState("");
  const [previewJson, setPreviewJson] = useState("");
  const [matchPickId, setMatchPickId] = useState("");
  const [matchExternalId, setMatchExternalId] = useState("");
  const [matchToolsMsg, setMatchToolsMsg] = useState("");

  const [leagueMatches, setLeagueMatches] = useState<
    { id: string; team1: string; team2: string; externalMatchId: string }[]
  >([]);

  useEffect(() => {
    setFantasyRulesetId(initialRulesetId ?? "");
  }, [initialRulesetId]);

  useEffect(() => {
    if (!isAdmin) return;
    if (
      phase !== "AUCTION_COMPLETE" &&
      phase !== "LEAGUE_ACTIVE" &&
      phase !== "LEAGUE_COMPLETE"
    )
      return;
    fetch(`/api/leagues/${leagueId}/matches`)
      .then((r) => r.json())
      .then((d) => {
        const rows = (d.matches ?? []) as {
          id: string;
          team1: string;
          team2: string;
          externalMatchId: string;
        }[];
        setLeagueMatches(rows);
      })
      .catch(() => {});
  }, [isAdmin, leagueId, phase]);

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

  async function previewSeriesPage() {
    setLoading("preview");
    setError("");
    setMatchToolsMsg("");
    setPreviewJson("");
    try {
      const url = seriesPageUrl.trim();
      if (!url) {
        setError("Enter a CricketData series page URL");
        return;
      }
      const res = await fetch(
        `/api/leagues/${leagueId}/matches/scrape-series-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Preview failed");
        return;
      }
      setPreviewJson(JSON.stringify(data.matches ?? [], null, 2));
      setMatchToolsMsg(`Found ${data.count ?? 0} match ids.`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function applyReconcileFromPreview() {
    setLoading("reconcile");
    setError("");
    setMatchToolsMsg("");
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(previewJson || "[]");
      } catch {
        setError("Preview JSON invalid");
        return;
      }
      if (!Array.isArray(raw) || raw.length === 0) {
        setError("Run preview first or paste a matches JSON array");
        return;
      }
      const matches = raw
        .map((row: unknown) => {
          if (typeof row === "string")
            return { externalMatchId: row };
          if (row && typeof row === "object" && "externalMatchId" in row) {
            return {
              externalMatchId: String(
                (row as { externalMatchId: string }).externalMatchId
              ),
            };
          }
          return { externalMatchId: "" };
        })
        .filter((m) => m.externalMatchId.trim() !== "");
      if (matches.length === 0) {
        setError("No valid externalMatchId entries in JSON");
        return;
      }
      const res = await fetch(
        `/api/leagues/${leagueId}/matches/reconcile-scrape`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matches }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Reconcile failed");
        return;
      }
      setMatchToolsMsg(
        `Updated ${data.updated}, skipped ${data.skipped}. ${(data.warnings || []).join(" ")}`
      );
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function applyManualExternalId() {
    setLoading("patchMatch");
    setError("");
    setMatchToolsMsg("");
    try {
      if (!matchPickId || !matchExternalId.trim()) {
        setError("Pick a match and enter CricAPI match UUID");
        return;
      }
      const res = await fetch(
        `/api/leagues/${leagueId}/matches/${matchPickId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalMatchId: matchExternalId.trim(),
            validate: true,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setMatchToolsMsg(`Match id saved: ${data.externalMatchId}`);
      setMatchExternalId("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function saveFantasyRuleset() {
    setLoading("ruleset");
    setError("");
    setRulesetSaveMsg("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/fantasy-ruleset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cricapiFantasyRulesetId: fantasyRulesetId.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRulesetSaveMsg("Fantasy ruleset saved.");
        router.refresh();
      } else {
        setError(data.error || "Failed to save ruleset");
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
              href={`/leagues/${leagueId}/standings/players`}
              className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Player points
            </Link>
            <Link
              href={`/leagues/${leagueId}/matches`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Matches
            </Link>
            <Link
              href={`/leagues/${leagueId}/squads/today`}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            >
              Today&apos;s squads
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
          <h3 className="text-sm font-medium text-gray-300">
            CricketData series page (match IDs)
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Open the IPL series schedule on cricketdata.org, paste the URL,
            preview ordered UUIDs, then reconcile open matches (by scheduled
            date). Use manual override if a single id is wrong. For cron, run{" "}
            <code className="rounded bg-gray-800 px-1">
              node scripts/cricketdata-series-match-ids.mjs
            </code>{" "}
            with{" "}
            <code className="rounded bg-gray-800 px-1">--post-reconcile</code>.
          </p>
          <input
            type="url"
            value={seriesPageUrl}
            onChange={(e) => setSeriesPageUrl(e.target.value)}
            placeholder="https://cricketdata.org/cricket-data-formats/series/..."
            className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={previewSeriesPage}
              disabled={loading !== null}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
            >
              {loading === "preview" ? "…" : "Preview IDs"}
            </button>
            <button
              type="button"
              onClick={applyReconcileFromPreview}
              disabled={loading !== null || !previewJson}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading === "reconcile" ? "…" : "Reconcile from preview"}
            </button>
          </div>
          {previewJson && (
            <textarea
              className="mt-3 h-32 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-gray-300"
              value={previewJson}
              onChange={(e) => setPreviewJson(e.target.value)}
              spellCheck={false}
            />
          )}
          <div className="mt-4 border-t border-gray-800 pt-4">
            <h4 className="text-xs font-medium text-gray-400">
              Manual match ID
            </h4>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={matchPickId}
                onChange={(e) => setMatchPickId(e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
              >
                <option value="">Select match…</option>
                {leagueMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.team1} vs {m.team2} —{" "}
                    {(m.externalMatchId || "").slice(0, 8) || "no-id"}…
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={matchExternalId}
                onChange={(e) => setMatchExternalId(e.target.value)}
                placeholder="CricAPI match UUID"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                onClick={applyManualExternalId}
                disabled={loading !== null}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {loading === "patchMatch" ? "…" : "Save ID"}
              </button>
            </div>
          </div>
          {matchToolsMsg && (
            <p className="mt-2 text-sm text-emerald-400">{matchToolsMsg}</p>
          )}
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

      {isAdmin && (phase === "AUCTION_COMPLETE" || phase === "LEAGUE_ACTIVE") && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-300">
            CricAPI fantasy ruleset
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Ruleset id from cricketdata.org member area. Used for{" "}
            <code className="rounded bg-gray-800 px-1">match_points</code>{" "}
            (optional). If empty, uses{" "}
            <code className="rounded bg-gray-800 px-1">
              CRICAPI_FANTASY_RULESET_ID
            </code>{" "}
            from server env when set; otherwise default rules on their API.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={fantasyRulesetId}
              onChange={(e) => setFantasyRulesetId(e.target.value)}
              placeholder="Ruleset id (optional)"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={saveFantasyRuleset}
              disabled={loading !== null}
              className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600 disabled:opacity-50"
            >
              {loading === "ruleset" ? "Saving..." : "Save"}
            </button>
          </div>
          {rulesetSaveMsg && (
            <p className="mt-2 text-sm text-emerald-400">{rulesetSaveMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}
