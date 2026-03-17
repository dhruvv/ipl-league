import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export default async function LeaguesPage() {
  const session = await auth();
  if (!session?.user) return null;

  const leagues = await prisma.league.findMany({
    where: {
      members: { some: { userId: session.user.id } },
    },
    include: {
      _count: { select: { members: true, players: true } },
      createdBy: { select: { username: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Leagues</h1>
          <p className="mt-1 text-sm text-gray-400">
            Signed in as {session.user.name}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/leagues/create"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Create League
          </Link>
          <SignOutButton />
        </div>
      </div>

      {leagues.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-gray-400">No leagues yet.</p>
          <p className="mt-1 text-sm text-gray-500">
            Create one or ask a friend to invite you.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/${league.id}`}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700"
            >
              <h2 className="font-semibold">{league.name}</h2>
              {league.description && (
                <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                  {league.description}
                </p>
              )}
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>{league._count.members} members</span>
                <span>{league._count.players} players</span>
                <span className="rounded bg-gray-800 px-2 py-0.5 capitalize">
                  {league.phase.toLowerCase().replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-xs text-gray-600">
                by {league.createdBy.username}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
