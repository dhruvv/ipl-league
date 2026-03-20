"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TeamInfo {
  id: string;
  name: string;
  members: { id: string; userId: string; username: string }[];
}

interface TeamSectionProps {
  leagueId: string;
  userId: string;
  teams: TeamInfo[];
  myTeamId: string | null;
  isSetup: boolean;
}

export function TeamSection({
  leagueId,
  userId,
  teams,
  myTeamId,
  isSetup,
}: TeamSectionProps) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function createTeam() {
    if (!teamName.trim()) return;
    setLoading("create");
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create team");
      } else {
        setTeamName("");
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function joinTeam(teamId: string) {
    setLoading(teamId);
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/join`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to join team");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  async function leaveTeam(teamId: string) {
    setLoading(`leave-${teamId}`);
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/leave`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to leave team");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(null);
    }
  }

  const myTeam = teams.find((t) => t.id === myTeamId);

  return (
    <div>
      {error && (
        <div className="mb-3 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {myTeam && (
        <div className="mb-4 rounded-xl border border-indigo-800/50 bg-indigo-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-indigo-400">
                Your Team
              </p>
              <Link
                href={`/leagues/${leagueId}/teams/${myTeam.id}`}
                className="mt-1 text-lg font-semibold hover:text-indigo-300"
              >
                {myTeam.name}
              </Link>
            </div>
            {isSetup && (
              <button
                onClick={() => leaveTeam(myTeam.id)}
                disabled={loading !== null}
                className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                {loading === `leave-${myTeam.id}` ? "Leaving..." : "Leave Team"}
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myTeam.members.map((m) => (
              <span
                key={m.userId}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  m.userId === userId
                    ? "bg-indigo-900/50 text-indigo-300"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                {m.username}
              </span>
            ))}
          </div>
        </div>
      )}

      {isSetup && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="New team name"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={createTeam}
            disabled={!teamName.trim() || loading !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading === "create" ? "Creating..." : "Create Team"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {teams.map((team) => {
          const isMyTeam = team.id === myTeamId;
          return (
            <div
              key={team.id}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                isMyTeam
                  ? "border-indigo-800/50 bg-indigo-950/20"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              <div>
                <Link
                  href={`/leagues/${leagueId}/teams/${team.id}`}
                  className="font-medium hover:text-indigo-300"
                >
                  {team.name}
                </Link>
                <div className="mt-1 flex flex-wrap gap-1">
                  {team.members.map((m) => (
                    <span key={m.userId} className="text-xs text-gray-500">
                      {m.username}
                    </span>
                  ))}
                  {team.members.length === 0 && (
                    <span className="text-xs text-gray-600">No members</span>
                  )}
                </div>
              </div>
              {isSetup && !isMyTeam && (
                <button
                  onClick={() => joinTeam(team.id)}
                  disabled={loading !== null}
                  className="rounded bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                  {loading === team.id ? "Joining..." : "Join"}
                </button>
              )}
            </div>
          );
        })}
        {teams.length === 0 && (
          <p className="text-sm text-gray-500">
            No teams created yet. Create one to get started.
          </p>
        )}
      </div>
    </div>
  );
}
