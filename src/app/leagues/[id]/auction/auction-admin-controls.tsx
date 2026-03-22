"use client";

import { useState, useCallback } from "react";
import type { AuctionState } from "./auction-view";

interface AdminControlsProps {
  leagueId: string;
  state: AuctionState;
  members: {
    id: string;
    userId: string;
    username: string;
    role: string;
  }[];
  onRefresh: () => void;
}

export function AdminControls({
  leagueId,
  state,
  members,
  onRefresh,
}: AdminControlsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  const handleEnd = useCallback(async () => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setConfirmEnd(false);
    await adminAction("end");
  }, [confirmEnd]);

  async function adminAction(
    endpoint: string,
    body?: Record<string, unknown>
  ) {
    setLoading(endpoint);
    setError("");
    try {
      const res = await fetch(`/api/auction/${leagueId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Action failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function changeRole(memberId: string, role: "ADMIN" | "MEMBER") {
    setError("");
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/members/${memberId}/role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to change role");
      } else {
        onRefresh();
      }
    } catch {
      setError("Network error");
    }
  }

  const currentPlayerStatus = state.currentPlayer?.status;
  const isBiddingOpen = currentPlayerStatus === "BIDDING_OPEN";
  const isPlayerActive =
    currentPlayerStatus === "ACTIVE" || currentPlayerStatus === "QUEUED";

  const potCounts = state.pots.map((pot) => {
    const total = state.players.filter((p) => p.pot === pot).length;
    const remaining = state.players.filter(
      (p) => p.pot === pot && p.status !== "SOLD" && p.status !== "UNSOLD"
    ).length;
    return { pot, remaining, total };
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-900/50 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {state.phase === "SETUP" && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-sm font-medium text-gray-300">Auction Control</h3>
          <button
            onClick={() => adminAction("start")}
            disabled={loading === "start"}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading === "start" ? "Starting..." : "Start Auction"}
          </button>
        </div>
      )}

      {(state.phase === "AUCTION_ACTIVE" ||
        state.phase === "AUCTION_PAUSED") && (
        <>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-300">
                Auction Control
              </h3>
              <div className="flex gap-2">
                {state.phase === "AUCTION_ACTIVE" && (
                  <button
                    onClick={() => adminAction("pause")}
                    disabled={loading !== null}
                    className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-600 disabled:opacity-50"
                  >
                    {loading === "pause" ? "Pausing..." : "Pause Auction"}
                  </button>
                )}
                {state.phase === "AUCTION_PAUSED" && (
                  <button
                    onClick={() => adminAction("resume")}
                    disabled={loading !== null}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {loading === "resume" ? "Resuming..." : "Resume Auction"}
                  </button>
                )}
                <button
                  onClick={handleEnd}
                  disabled={loading !== null}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                    confirmEnd
                      ? "bg-red-600 text-white hover:bg-red-500"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {loading === "end"
                    ? "Ending..."
                    : confirmEnd
                      ? "Confirm End Auction"
                      : "End Auction"}
                </button>
              </div>
            </div>

            <h3 className="mb-3 text-sm font-medium text-gray-300">
              Select Pot
            </h3>
            <div className="flex flex-wrap gap-2">
              {potCounts.map(({ pot, remaining, total }) => (
                <button
                  key={pot}
                  onClick={() => adminAction("select-pot", { pot })}
                  disabled={loading !== null || state.phase === "AUCTION_PAUSED"}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    state.currentPot === pot
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  } disabled:opacity-50`}
                >
                  {pot}{" "}
                  <span className="text-xs opacity-70">
                    ({remaining}/{total})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {state.currentPot && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <h3 className="mb-3 text-sm font-medium text-gray-300">
                Player Controls
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => adminAction("prev")}
                  disabled={
                    loading !== null ||
                    state.currentPlayerIndex === 0 ||
                    state.phase === "AUCTION_PAUSED"
                  }
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30"
                >
                  &larr; Prev
                </button>
                <button
                  onClick={() => adminAction("next")}
                  disabled={
                    loading !== null ||
                    state.currentPlayerIndex >=
                      state.potPlayers.length - 1 ||
                    state.phase === "AUCTION_PAUSED"
                  }
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30"
                >
                  Next &rarr;
                </button>

                <div className="mx-2 w-px bg-gray-700" />

                {isPlayerActive && state.phase === "AUCTION_ACTIVE" && (
                  <button
                    onClick={() => adminAction("open-bidding")}
                    disabled={loading !== null}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Open Bidding
                  </button>
                )}

                {isBiddingOpen && state.phase === "AUCTION_ACTIVE" && (
                  <button
                    onClick={() => adminAction("close-bidding")}
                    disabled={loading !== null}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    Close Bidding
                  </button>
                )}

                {state.phase === "AUCTION_ACTIVE" && (
                  <>
                    <button
                      onClick={() => adminAction("skip")}
                      disabled={loading !== null || isBiddingOpen}
                      className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-30"
                    >
                      Skip
                    </button>

                    <button
                      onClick={() => adminAction("undo")}
                      disabled={loading !== null || state.soldLog.length === 0}
                      className="rounded-lg bg-amber-700 px-3 py-2 text-sm text-amber-100 hover:bg-amber-600 disabled:opacity-30"
                    >
                      Undo Last Sale
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <details className="rounded-xl border border-gray-800 bg-gray-900">
        <summary className="cursor-pointer p-4 text-sm font-medium text-gray-300">
          Member Management ({members.length})
        </summary>
        <div className="space-y-2 px-4 pb-4">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{m.username}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    m.role === "OWNER"
                      ? "bg-amber-900/50 text-amber-300"
                      : m.role === "ADMIN"
                        ? "bg-indigo-900/50 text-indigo-300"
                        : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {m.role}
                </span>
              </div>
              {m.role !== "OWNER" && (
                <button
                  onClick={() =>
                    changeRole(
                      m.id,
                      m.role === "ADMIN" ? "MEMBER" : "ADMIN"
                    )
                  }
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {m.role === "ADMIN"
                    ? "Demote to Member"
                    : "Promote to Admin"}
                </button>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
