import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>;
}) {
  const { id: leagueId, teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const membership = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: session.user.id } },
  });
  if (!membership) notFound();

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: { user: { select: { id: true, username: true, email: true } } },
      },
      league: { select: { name: true, budget: true, overseasCap: true } },
    },
  });

  if (!team || team.leagueId !== leagueId) notFound();

  const soldPlayers = await prisma.player.findMany({
    where: { leagueId, status: "SOLD", soldToTeamId: teamId },
    select: {
      id: true,
      name: true,
      position: true,
      country: true,
      iplTeam: true,
      basePrice: true,
      soldPrice: true,
      pot: true,
    },
    orderBy: { soldPrice: "desc" },
  });

  const spent = soldPlayers.reduce((sum, p) => sum + (p.soldPrice ?? 0), 0);
  const overseasCount = soldPlayers.filter((p) => p.country !== "India").length;
  const remaining = team.league.budget - spent;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link
        href={`/leagues/${leagueId}`}
        className="text-sm text-gray-400 hover:text-gray-300"
      >
        &larr; Back to league
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {team.league.name}
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Total Budget
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {(team.league.budget / 10000000).toFixed(1)} Cr
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Remaining
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
            {(remaining / 10000000).toFixed(1)} Cr
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Players
          </p>
          <p className="mt-1 text-xl font-semibold">{soldPlayers.length}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Overseas
          </p>
          <p className="mt-1 text-xl font-semibold">
            {overseasCount}/{team.league.overseasCap}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Members ({team.members.length})
        </h2>
        <div className="mt-3 space-y-2">
          {team.members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
            >
              <div>
                <span className="font-medium">{m.user.username}</span>
                <span className="ml-2 text-sm text-gray-500">{m.user.email}</span>
              </div>
              <span className="rounded bg-gray-800 px-2 py-0.5 text-xs capitalize text-gray-400">
                {m.role.toLowerCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Roster ({soldPlayers.length})
        </h2>
        {soldPlayers.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No players purchased yet.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Pos</th>
                  <th className="pb-2 pr-4">Country</th>
                  <th className="pb-2 pr-4">IPL Team</th>
                  <th className="pb-2 pr-4">Pot</th>
                  <th className="pb-2 pr-4 text-right">Base</th>
                  <th className="pb-2 text-right">Sold</th>
                </tr>
              </thead>
              <tbody>
                {soldPlayers.map((p) => (
                  <tr key={p.id} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 font-medium">{p.name}</td>
                    <td className="py-2 pr-4 text-gray-400">{p.position ?? "-"}</td>
                    <td className="py-2 pr-4">
                      {p.country !== "India" ? (
                        <span className="text-amber-400">{p.country}</span>
                      ) : (
                        <span className="text-gray-400">{p.country}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-400">{p.iplTeam ?? "-"}</td>
                    <td className="py-2 pr-4 text-gray-400">{p.pot}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-500">
                      {(p.basePrice / 10000000).toFixed(1)} Cr
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-emerald-400">
                      {((p.soldPrice ?? 0) / 10000000).toFixed(1)} Cr
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-700">
                  <td colSpan={6} className="py-2 pr-4 text-right text-sm font-medium text-gray-400">
                    Total Spent
                  </td>
                  <td className="py-2 text-right tabular-nums font-bold text-emerald-400">
                    {(spent / 10000000).toFixed(1)} Cr
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
