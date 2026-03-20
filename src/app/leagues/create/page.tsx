"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export default function CreateLeaguePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formData.get("name"),
        description: formData.get("description"),
        budget: Math.round((Number(formData.get("budget")) || 1) * 10000000),
        scoringTopN: Number(formData.get("scoringTopN")) || 7,
        overseasCap: Number(formData.get("overseasCap")) || 4,
        minBidIncrement: Math.round((Number(formData.get("minBidIncrement")) || 1) * 10000000),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create league");
      return;
    }

    const league = await res.json();
    router.push(`/leagues/${league.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/leagues"
        className="text-sm text-gray-400 hover:text-gray-300"
      >
        &larr; Back to leagues
      </Link>

      <h1 className="mt-4 text-2xl font-bold">Create a League</h1>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-900/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300">
            League Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="e.g. IPL 2026 Friends League"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-300">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Optional description for your league"
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-gray-300">
              Budget per Team (Cr)
            </label>
            <div className="relative mt-1">
              <input
                id="budget"
                name="budget"
                type="number"
                defaultValue={1}
                min={0.1}
                step={0.1}
                className="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                Cr
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">1 Cr = 1,00,00,000</p>
          </div>

          <div>
            <label htmlFor="scoringTopN" className="block text-sm font-medium text-gray-300">
              Top-N Scoring
            </label>
            <input
              id="scoringTopN"
              name="scoringTopN"
              type="number"
              defaultValue={7}
              min={1}
              max={20}
              className="mt-1 block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">Top players counted per match</p>
          </div>

          <div>
            <label htmlFor="overseasCap" className="block text-sm font-medium text-gray-300">
              Overseas Cap
            </label>
            <OverseasCapSlider />
          </div>

          <div>
            <label htmlFor="minBidIncrement" className="block text-sm font-medium text-gray-300">
              Min Bid Increment (Cr)
            </label>
            <div className="relative mt-1">
              <input
                id="minBidIncrement"
                name="minBidIncrement"
                type="number"
                defaultValue={1}
                min={0.1}
                step={0.1}
                className="block w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                Cr
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Minimum raise per bid</p>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create League"}
          </button>
          <Link
            href="/leagues"
            className="rounded-lg border border-gray-700 px-6 py-2.5 text-sm text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function OverseasCapSlider() {
  const [value, setValue] = useState(4);

  return (
    <>
      <div className="mt-1 flex items-center gap-3">
        <input
          id="overseasCap"
          name="overseasCap"
          type="range"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          min={0}
          max={11}
          className="w-full accent-indigo-500"
        />
        <span className="min-w-[2ch] text-center text-sm font-medium tabular-nums">
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-500">Max overseas players per team</p>
    </>
  );
}
