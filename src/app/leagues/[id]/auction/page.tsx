import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AuctionView } from "./auction-view";

export default async function AuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phase: true,
      budget: true,
      overseasCap: true,
      members: {
        include: {
          user: { select: { id: true, username: true } },
        },
      },
    },
  });

  if (!league) notFound();

  const membership = league.members.find(
    (m) => m.user.id === session.user.id
  );
  if (!membership) notFound();

  const isAdmin = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${id}`}
            className="text-sm text-gray-400 hover:text-gray-300"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-semibold">{league.name}</h1>
          <span className="rounded bg-gray-800 px-2 py-0.5 text-xs capitalize text-gray-400">
            {league.phase.toLowerCase().replace("_", " ")}
          </span>
        </div>
        <span className="text-sm text-gray-500">
          {isAdmin ? "Admin" : "Member"}
        </span>
      </header>

      <AuctionView
        leagueId={league.id}
        userId={session.user.id}
        isAdmin={isAdmin}
        members={league.members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          username: m.user.username,
          role: m.role,
        }))}
      />
    </div>
  );
}
