import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteLink } from "./invite-link";
import { PlayerImport } from "./player-import";
import { RoleToggle } from "./role-toggle";
import { TeamSection } from "./team-section";
import { LeagueActions } from "./league-actions";

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      createdBy: { select: { username: true } },
      members: {
        include: { user: { select: { id: true, username: true, email: true } } },
        orderBy: { role: "asc" },
      },
      players: {
        orderBy: [{ pot: "asc" }, { slNo: "asc" }],
      },
      teams: {
        include: {
          members: {
            include: { user: { select: { id: true, username: true } } },
          },
        },
      },
      _count: { select: { players: true, bids: true } },
    },
  });

  if (!league) notFound();

  const isMember = league.members.some((m) => m.userId === session.user.id);
  if (!isMember) notFound();

  const myMembership = league.members.find(
    (m) => m.userId === session.user.id
  );
  const isOwner = myMembership?.role === "OWNER";
  const isAdmin =
    myMembership?.role === "OWNER" || myMembership?.role === "ADMIN";

  const pots = [...new Set(league.players.map((p) => p.pot))].sort();

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link
        href="/leagues"
        className="text-sm text-gray-400 hover:text-gray-300"
      >
        &larr; Back to leagues
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{league.name}</h1>
          {league.description && (
            <p className="mt-1 text-gray-400">{league.description}</p>
          )}
          <div className="mt-2 flex gap-4 text-sm text-gray-500">
            <span>Created by {league.createdBy.username}</span>
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs capitalize">
              {league.phase.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Budget</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {(league.budget / 10000000).toFixed(1)} Cr
          </p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Top-N Scoring</p>
          <p className="mt-1 text-xl font-semibold">{league.scoringTopN}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Overseas Cap</p>
          <p className="mt-1 text-xl font-semibold">{league.overseasCap}</p>
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Bid Increment</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {(league.minBidIncrement / 10000000).toFixed(1)} Cr
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Teams ({league.teams.length})
        </h2>
        <div className="mt-3">
          <TeamSection
            leagueId={league.id}
            userId={session.user.id}
            teams={league.teams.map((t) => ({
              id: t.id,
              name: t.name,
              members: t.members.map((m) => ({
                id: m.id,
                userId: m.user.id,
                username: m.user.username,
              })),
            }))}
            myTeamId={myMembership?.teamId ?? null}
            isSetup={league.phase === "SETUP"}
          />
        </div>
      </div>

      {(league.phase === "AUCTION_ACTIVE" ||
        league.phase === "AUCTION_PAUSED" ||
        (isAdmin && league.phase === "SETUP" && league._count.players > 0)) && (
        <div className="mt-8">
          <Link
            href={`/leagues/${id}/auction`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {league.phase === "AUCTION_ACTIVE" || league.phase === "AUCTION_PAUSED"
              ? "Enter Auction"
              : "Start Auction"}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      )}

      {(league.phase === "AUCTION_COMPLETE" ||
        league.phase === "LEAGUE_ACTIVE" ||
        league.phase === "LEAGUE_COMPLETE") && (
        <div className="mt-8">
          <LeagueActions
            leagueId={league.id}
            phase={league.phase}
            isAdmin={isAdmin}
          />
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Members ({league.members.length})
        </h2>
        <div className="mt-3 space-y-2">
          {league.members.map((m) => {
            const roleColors: Record<string, string> = {
              OWNER: "bg-amber-900/50 text-amber-300",
              ADMIN: "bg-indigo-900/50 text-indigo-300",
              MEMBER: "bg-gray-800 text-gray-400",
            };
            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
              >
                <div>
                  <span className="font-medium">{m.user.username}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    {m.user.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs capitalize ${
                      roleColors[m.role] ?? roleColors.MEMBER
                    }`}
                  >
                    {m.role.toLowerCase()}
                  </span>
                  {isAdmin && m.role !== "OWNER" && (
                    <RoleToggle
                      leagueId={league.id}
                      memberId={m.id}
                      currentRole={m.role}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold">Invite Friends</h2>
          <p className="mt-1 text-sm text-gray-400">
            Share this link to invite friends to your league.
          </p>
          <div className="mt-3">
            <InviteLink inviteCode={league.inviteCode} />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold">
          Players ({league._count.players})
        </h2>

        {isAdmin && league.phase === "SETUP" && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h3 className="text-sm font-medium text-gray-300">Import Players</h3>
            <p className="mt-1 text-xs text-gray-500">
              Import from a Google Sheet or upload a CSV. Re-importing replaces all unsold players.
            </p>
            <div className="mt-4">
              <PlayerImport leagueId={league.id} />
            </div>
          </div>
        )}

        {league.players.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No players imported yet.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {pots.map((pot) => {
              const potPlayers = league.players.filter((p) => p.pot === pot);
              return (
                <div key={pot}>
                  <h3 className="text-sm font-medium text-gray-400">
                    {pot} ({potPlayers.length})
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                          <th className="pb-2 pr-4">#</th>
                          <th className="pb-2 pr-4">Name</th>
                          <th className="pb-2 pr-4">Pos</th>
                          <th className="pb-2 pr-4">Country</th>
                          <th className="pb-2 pr-4">Team</th>
                          <th className="pb-2 pr-4 text-right">Base Price</th>
                          <th className="pb-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {potPlayers.map((p) => (
                          <tr
                            key={p.id}
                            className="border-b border-gray-800/50"
                          >
                            <td className="py-2 pr-4 text-gray-500">{p.slNo ?? "-"}</td>
                            <td className="py-2 pr-4 font-medium">{p.name}</td>
                            <td className="py-2 pr-4 text-gray-400">{p.position ?? "-"}</td>
                            <td className="py-2 pr-4 text-gray-400">
                              {p.country !== "India" ? (
                                <span className="text-amber-400">{p.country}</span>
                              ) : (
                                p.country
                              )}
                            </td>
                            <td className="py-2 pr-4 text-gray-400">{p.iplTeam ?? "-"}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              {p.basePrice.toLocaleString()}
                            </td>
                            <td className="py-2 text-right">
                              <span className="rounded bg-gray-800 px-2 py-0.5 text-xs capitalize">
                                {p.status.toLowerCase().replace("_", " ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
