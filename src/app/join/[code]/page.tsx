import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

export default async function JoinLeaguePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const league = await prisma.league.findUnique({
    where: { inviteCode: code },
    select: { id: true, name: true },
  });

  if (!league) notFound();

  const existing = await prisma.leagueMember.findUnique({
    where: {
      leagueId_userId: {
        leagueId: league.id,
        userId: session.user.id,
      },
    },
  });

  if (!existing) {
    await prisma.leagueMember.create({
      data: {
        leagueId: league.id,
        userId: session.user.id,
        role: "MEMBER",
      },
    });
  }

  redirect(`/leagues/${league.id}`);
}
