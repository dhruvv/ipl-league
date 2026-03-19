"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export function PlayerImport({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported?: number;
    errors?: string[];
    error?: string;
  } | null>(null);

  async function importFromSheet() {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/leagues/${leagueId}/players/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl }),
      });
      const data = await res.json();
      setResult(data);
      if (data.imported > 0) router.refresh();
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function importFromFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/leagues/${leagueId}/players/import`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
      if (data.imported > 0) router.refresh();
    } catch {
      setResult({ error: "Network error" });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300">
          Google Sheet URL
        </label>
        <div className="mt-1 flex gap-2">
          <input
            type="url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={importFromSheet}
            disabled={loading || !sheetUrl.trim()}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Paste any Google Sheets URL (share link, edit link, or published link)
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-gray-800" />
        <span className="text-xs text-gray-500">or</span>
        <div className="h-px flex-1 bg-gray-800" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300">
          Upload CSV File
        </label>
        <div className="mt-1 flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="flex-1 text-sm text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-300 hover:file:bg-gray-700"
          />
          <button
            onClick={importFromFile}
            disabled={loading}
            className="shrink-0 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Upload
          </button>
        </div>
      </div>

      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.error
              ? "bg-red-900/50 text-red-300"
              : result.imported
                ? "bg-green-900/50 text-green-300"
                : "bg-yellow-900/50 text-yellow-300"
          }`}
        >
          {result.error && <p>{result.error}</p>}
          {result.imported !== undefined && (
            <p>{result.imported} players imported successfully.</p>
          )}
          {result.errors && result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs opacity-75">
                {result.errors.length} warning(s)
              </summary>
              <ul className="mt-1 list-inside list-disc text-xs opacity-75">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
