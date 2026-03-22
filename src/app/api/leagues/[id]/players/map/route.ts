import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { fetchMatchSquad } from "@/lib/cricapi";
import { matchPlayers } from "@/lib/player-matcher";
import type { CricApiSquadPlayer } from "@/lib/cricapi";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const players = await prisma.player.findMany({
      where: { leagueId },
      select: { id: true, name: true, iplTeam: true, externalId: true },
      orderBy: [{ pot: "asc" }, { slNo: "asc" }],
    });

    const matches = await prisma.leagueMatch.findMany({
      where: { leagueId },
      select: { externalMatchId: true },
      take: 5,
    });

    let cricApiPlayers: CricApiSquadPlayer[] = [];

    if (process.env.CRICAPI_KEY) {
      const seen = new Set<string>();
      for (const match of matches) {
        try {
          const squads = await fetchMatchSquad(match.externalMatchId);
          for (const squad of squads) {
            for (const p of squad.players) {
              if (!seen.has(p.id)) {
                seen.add(p.id);
                cricApiPlayers.push(p);
              }
            }
          }
        } catch {
          // skip matches that fail
        }
      }
    }

    const suggestions = matchPlayers(
      players.filter((p) => !p.externalId),
      cricApiPlayers
    );

    const alreadyMapped = players
      .filter((p) => p.externalId)
      .map((p) => ({
        playerId: p.id,
        playerName: p.name,
        externalId: p.externalId,
      }));

    return NextResponse.json({ suggestions, alreadyMapped, cricApiPlayers });
  } catch (err) {
    console.error("GET /api/leagues/[id]/players/map error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = await requireAuctionAdmin(leagueId, session.user.id);
    if (!admin)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const mappings = body.mappings as { playerId: string; externalId: string }[];

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json({ error: "No mappings provided" }, { status: 400 });
    }

    const updates = mappings.map((m) =>
      prisma.player.update({
        where: { id: m.playerId },
        data: { externalId: m.externalId },
      })
    );

    await prisma.$transaction(updates);

    return NextResponse.json({ updated: mappings.length });
  } catch (err) {
    console.error("POST /api/leagues/[id]/players/map error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
