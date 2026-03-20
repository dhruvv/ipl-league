"use client";

import type { AuctionPlayer, TeamBudgetInfo, TeamInfo } from "./auction-view";

interface TeamSidebarProps {
  budgets: TeamBudgetInfo[];
  userId: string;
  players: AuctionPlayer[];
  overseasCap: number;
  teams: TeamInfo[];
}

export function TeamSidebar({
  budgets,
  userId,
  players,
  overseasCap,
  teams,
}: TeamSidebarProps) {
  const myTeam = teams.find((t) => t.memberUserIds.includes(userId));
  const myTeamBudget = myTeam
    ? budgets.find((b) => b.teamId === myTeam.id)
    : null;
  const myPlayers = myTeam
    ? players.filter(
        (p) => p.status === "SOLD" && p.soldToTeamId === myTeam.id
      )
    : [];

  return (
    <aside className="hidden w-72 flex-shrink-0 overflow-y-auto border-l border-gray-800 bg-gray-950 p-4 lg:block">
      {myTeam && myTeamBudget ? (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-300">
            My Team: {myTeam.name}
          </h3>

          <div className="mt-3 space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Budget</span>
                <span className="tabular-nums">
                  {(myTeamBudget.remaining / 10000000).toFixed(1)} /{" "}
                  {(myTeamBudget.totalBudget / 10000000).toFixed(1)} Cr
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{
                    width: `${(myTeamBudget.remaining / myTeamBudget.totalBudget) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Players</span>
              <span className="tabular-nums">{myTeamBudget.playerCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Overseas</span>
              <span
                className={`tabular-nums ${
                  myTeamBudget.overseasCount >= overseasCap
                    ? "text-amber-400"
                    : ""
                }`}
              >
                {myTeamBudget.overseasCount}/{overseasCap}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Spent</span>
              <span className="tabular-nums">
                {(myTeamBudget.spent / 10000000).toFixed(1)} Cr
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg bg-amber-900/20 p-3 text-sm text-amber-300">
          Join a team to bid and track your budget.
        </div>
      )}

      {myPlayers.length > 0 && (
        <div className="mb-6">
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
                  {((p.soldPrice ?? 0) / 10000000).toFixed(1)} Cr
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-gray-300">
          All Teams
        </h3>
        <div className="mt-2 space-y-1">
          {budgets.map((b) => {
            const isMyTeam = b.teamId === myTeam?.id;
            return (
              <div
                key={b.teamId}
                className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${
                  isMyTeam ? "bg-gray-900" : ""
                }`}
              >
                <span className="truncate text-gray-300">
                  {b.teamName}
                  {isMyTeam && (
                    <span className="ml-1 text-xs text-indigo-400">
                      (you)
                    </span>
                  )}
                </span>
                <span className="ml-2 flex-shrink-0 text-xs tabular-nums text-gray-500">
                  {(b.remaining / 10000000).toFixed(1)} Cr | OS:{b.overseasCount}
                </span>
              </div>
            );
          })}
          {budgets.length === 0 && (
            <p className="text-xs text-gray-600">No teams yet</p>
          )}
        </div>
      </div>
    </aside>
  );
}
