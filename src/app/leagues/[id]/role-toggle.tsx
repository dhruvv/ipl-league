"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface RoleToggleProps {
  leagueId: string;
  memberId: string;
  currentRole: string;
}

export function RoleToggle({
  leagueId,
  memberId,
  currentRole,
}: RoleToggleProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const newRole = currentRole === "ADMIN" ? "MEMBER" : "ADMIN";
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/members/${memberId}/role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
    >
      {loading
        ? "..."
        : currentRole === "ADMIN"
          ? "Demote"
          : "Promote"}
    </button>
  );
}
