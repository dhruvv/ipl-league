"use client";

import type { AuctionPlayer, BudgetInfo } from "./auction-view";

interface TeamSidebarProps {
  budgets: BudgetInfo[];
  userId: string;
  players: AuctionPlayer[];
  overseasCap: number;
}

export function TeamSidebar({
  budgets,
  userId,
  players,
  overseasCap,
}: TeamSidebarProps) {
  const myBudget = budgets.find((b) => b.userId === userId);
  const myPlayers = players.filter(
    (p) => p.status === "SOLD" && p.soldTo === userId
  );

  return (
    <aside className="hidden w-72 flex-shrink-0 overflow-y-auto border-l border-gray-800 bg-gray-950 p-4 lg:block">
      {myBudget && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-300">My Team</h3>

          <div className="mt-3 space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Budget</span>
                <span className="tabular-nums">
                  {myBudget.remaining.toLocaleString()} /{" "}
                  {myBudget.totalBudget.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{
                    width: `${(myBudget.remaining / myBudget.totalBudget) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Players</span>
              <span className="tabular-nums">{myBudget.playerCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Overseas</span>
              <span
                className={`tabular-nums ${
                  myBudget.overseasCount >= overseasCap
                    ? "text-amber-400"
                    : ""
                }`}
              >
                {myBudget.overseasCount}/{overseasCap}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Spent</span>
              <span className="tabular-nums">
                {myBudget.spent.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {myPlayers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300">
            Won ({myPlayers.length})
          </h3>
          <div className="mt-2 space-y-1">
            {myPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded bg-gray-900 px-2 py-1.5 text-sm"
              >
                <span className="truncate">
                  {p.name}
                  {p.country !== "India" && (
                    <span className="ml-1 text-xs text-amber-400">
                      OS
                    </span>
                  )}
                </span>
                <span className="ml-2 flex-shrink-0 text-xs tabular-nums text-gray-500">
                  {p.soldPrice?.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-300">
          All Teams
        </h3>
        <div className="mt-2 space-y-1">
          {budgets.map((b) => (
            <div
              key={b.userId}
              className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                b.userId === userId ? "bg-gray-900" : ""
              }`}
            >
              <span className="truncate text-gray-300">
                {b.username}
                {b.userId === userId && (
                  <span className="ml-1 text-xs text-indigo-400">
                    (you)
                  </span>
                )}
              </span>
              <span className="ml-2 flex-shrink-0 text-xs tabular-nums text-gray-500">
                {b.remaining.toLocaleString()} | OS:{b.overseasCount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
