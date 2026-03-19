"use client";

import { useState } from "react";

export function InviteLink({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${inviteCode}`
      : `/join/${inviteCode}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={url}
        className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:outline-none"
      />
      <button
        onClick={copy}
        className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
