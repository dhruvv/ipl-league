"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface Suggestion {
  externalId: string;
  name: string;
  score: number;
  franchiseAligned: boolean;
}

interface MatchSuggestion {
  playerId: string;
  playerName: string;
  playerIplTeam: string | null;
  suggestions: Suggestion[];
  autoMapEligible: boolean;
}

interface AlreadyMapped {
  playerId: string;
  playerName: string;
  externalId: string;
}

export default function PlayerMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = use(params);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [alreadyMapped, setAlreadyMapped] = useState<AlreadyMapped[]>([]);
  const [squadCount, setSquadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoLoading, setAutoLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [autoReport, setAutoReport] = useState<string>("");

  function loadSuggestions(silent?: boolean) {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    fetch(`/api/leagues/${leagueId}/players/map`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSuggestions(data.suggestions ?? []);
        setAlreadyMapped(data.alreadyMapped ?? []);
        setSquadCount(data.squadCount ?? 0);
        const initial: Record<string, string> = {};
        for (const s of data.suggestions ?? []) {
          if (s.autoMapEligible && s.suggestions.length > 0) {
            initial[s.playerId] = s.suggestions[0].externalId;
          } else if (
            s.suggestions.length > 0 &&
            s.suggestions[0].score > 0.6
          ) {
            initial[s.playerId] = s.suggestions[0].externalId;
          }
        }
        setSelected(initial);
      })
      .catch(() => {
        if (!silent) setError("Failed to load player data");
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }

  useEffect(() => {
    loadSuggestions(false);
  }, [leagueId]);

  async function runAutoMap(dryRun: boolean) {
    setAutoLoading(dryRun ? "preview" : "apply");
    setError("");
    setSuccess("");
    setAutoReport("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/players/map/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Auto-map failed");
        return;
      }
      const lines = [
        dryRun ? "Preview (no changes saved):" : "Auto-map complete:",
        `  Qualified: ${data.mapped}`,
        `  Skipped (low confidence): ${data.skippedNotEligible ?? 0}`,
        `  Skipped (duplicate API player): ${data.skippedDuplicateApiId ?? 0}`,
        `  CricAPI squad players loaded: ${data.squadCount ?? 0}`,
      ];
      if (data.ambiguous?.length > 0) {
        lines.push("  Needs review (sample up to 8):");
        for (const a of data.ambiguous.slice(0, 8)) {
          lines.push(`    — ${a.playerName}: ${a.reason}`);
        }
        if (data.ambiguous.length > 8) {
          lines.push(`    … and ${data.ambiguous.length - 8} more`);
        }
      }
      setAutoReport(lines.join("\n"));
      if (!dryRun && data.mapped > 0) {
        setSuccess(`Mapped ${data.mapped} players automatically.`);
        loadSuggestions(true);
      }
    } catch {
      setError("Network error");
    } finally {
      setAutoLoading(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    const mappings = Object.entries(selected).map(([playerId, externalId]) => ({
      playerId,
      externalId,
    }));
    if (mappings.length === 0) {
      setError("No players selected for mapping");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/leagues/${leagueId}/players/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuccess(`Mapped ${data.updated} players successfully`);
        setSelected({});
        loadSuggestions(true);
      } else {
        const data = await res.json();
        setError(data.error || "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading player data...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={`/leagues/${leagueId}`}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            &larr; Back to League
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Map Players to CricAPI</h1>
          <p className="text-sm text-gray-400">
            Name + IPL franchise matching against synced match squads. Use
            auto-map for high-confidence rows; fix the rest manually.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            CricAPI squad players in context: {squadCount}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runAutoMap(true)}
            disabled={autoLoading !== null || saving}
            className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 disabled:opacity-50"
          >
            {autoLoading === "preview" ? "Preview…" : "Preview auto-map"}
          </button>
          <button
            type="button"
            onClick={() => runAutoMap(false)}
            disabled={autoLoading !== null || saving}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {autoLoading === "apply" ? "Applying…" : "Apply auto-map"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(selected).length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save ${Object.keys(selected).length} manual`}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-emerald-900/50 px-4 py-2 text-sm text-emerald-300">
          {success}
        </div>
      )}
      {autoReport && (
        <pre className="mb-4 whitespace-pre-wrap rounded-lg border border-gray-800 bg-gray-900 p-4 text-xs text-gray-300">
          {autoReport}
        </pre>
      )}

      {alreadyMapped.length > 0 && (
        <details className="mb-6 rounded-xl border border-gray-800 bg-gray-900">
          <summary className="cursor-pointer p-4 text-sm font-medium text-gray-300">
            Already Mapped ({alreadyMapped.length})
          </summary>
          <div className="space-y-1 px-4 pb-4">
            {alreadyMapped.map((m) => (
              <div
                key={m.playerId}
                className="flex items-center justify-between rounded px-3 py-2 text-sm text-gray-400"
              >
                <span>{m.playerName}</span>
                <span className="font-mono text-xs text-emerald-400">
                  {m.externalId}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {suggestions.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-gray-400">
            {alreadyMapped.length > 0
              ? "All players have been mapped."
              : "No players to map. Sync matches first to load CricAPI squad data."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <div
              key={s.playerId}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.playerName}</span>
                {s.playerIplTeam && (
                  <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">
                    {s.playerIplTeam}
                  </span>
                )}
                {s.autoMapEligible && (
                  <span className="rounded bg-emerald-900/50 px-2 py-0.5 text-xs text-emerald-400">
                    Auto-map eligible
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {s.suggestions.length === 0 ? (
                  <p className="text-sm text-gray-500">No matches found</p>
                ) : (
                  s.suggestions.map((sg) => (
                    <label
                      key={sg.externalId}
                      className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition ${
                        selected[s.playerId] === sg.externalId
                          ? "bg-indigo-900/40 text-indigo-300"
                          : "text-gray-400 hover:bg-gray-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name={s.playerId}
                        checked={selected[s.playerId] === sg.externalId}
                        onChange={() =>
                          setSelected((prev) => ({
                            ...prev,
                            [s.playerId]: sg.externalId,
                          }))
                        }
                        className="accent-indigo-500"
                      />
                      <span className="flex-1">{sg.name}</span>
                      {sg.franchiseAligned && (
                        <span className="rounded bg-blue-900/40 px-1.5 py-0.5 text-xs text-blue-300">
                          franchise
                        </span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          sg.score > 0.8
                            ? "bg-emerald-900/50 text-emerald-400"
                            : sg.score > 0.5
                              ? "bg-amber-900/50 text-amber-400"
                              : "bg-gray-700 text-gray-500"
                        }`}
                      >
                        {Math.round(sg.score * 100)}%
                      </span>
                    </label>
                  ))
                )}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm transition ${
                    !selected[s.playerId]
                      ? "bg-gray-800 text-gray-300"
                      : "text-gray-500 hover:bg-gray-800"
                  }`}
                >
                  <input
                    type="radio"
                    name={s.playerId}
                    checked={!selected[s.playerId]}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = { ...prev };
                        delete next[s.playerId];
                        return next;
                      })
                    }
                    className="accent-gray-500"
                  />
                  <span>Skip (don&apos;t map)</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
