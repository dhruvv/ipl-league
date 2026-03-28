import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { fetchMatchSquad } from "@/lib/cricapi";
import {
  matchPlayers,
  buildSquadPlayerListFromSquads,
  type SquadPlayerWithTeam,
} from "@/lib/player-matcher";

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

    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = Boolean(body?.dryRun);
    } catch {
      /* no body */
    }

    const players = await prisma.player.findMany({
      where: { leagueId, externalId: null },
      select: { id: true, name: true, iplTeam: true, position: true },
      orderBy: [{ pot: "asc" }, { slNo: "asc" }],
    });

    const matches = await prisma.leagueMatch.findMany({
      where: { leagueId },
      select: { externalMatchId: true },
      take: 5,
    });

    const squadByPlayerId = new Map<string, SquadPlayerWithTeam>();
    if (process.env.CRICAPI_KEY) {
      for (const match of matches) {
        try {
          const squads = await fetchMatchSquad(match.externalMatchId);
          for (const sp of buildSquadPlayerListFromSquads(squads)) {
            if (!squadByPlayerId.has(sp.player.id)) {
              squadByPlayerId.set(sp.player.id, sp);
            }
          }
        } catch {
          /* skip */
        }
      }
    }
    const squadPlayers = [...squadByPlayerId.values()];

    if (players.length === 0) {
      return NextResponse.json({
        dryRun,
        mapped: 0,
        skippedDuplicateApiId: 0,
        skippedNotEligible: 0,
        ambiguous: [] as { playerId: string; playerName: string; reason: string }[],
        mappings: [] as { playerId: string; externalId: string }[],
        message: "No unmapped players",
        squadCount: squadPlayers.length,
      });
    }

    if (squadPlayers.length === 0) {
      return NextResponse.json(
        {
          error:
            "No squad data. Sync matches (series) first so CricAPI squads can be loaded.",
        },
        { status: 400 }
      );
    }

    const rows = matchPlayers(players, squadPlayers);
    const usedApiIds = new Set<string>();
    const mappedPairs: { playerId: string; externalId: string }[] = [];
    let skippedDuplicateApiId = 0;
    let skippedNotEligible = 0;
    const ambiguous: { playerId: string; playerName: string; reason: string }[] =
      [];

    for (const row of rows) {
      if (!row.autoMapEligible || !row.suggestions[0]) {
        skippedNotEligible++;
        const top = row.suggestions[0];
        ambiguous.push({
          playerId: row.playerId,
          playerName: row.playerName,
          reason: top
            ? `Best match "${top.name}" at ${Math.round(top.score * 100)}% (needs review)`
            : "No candidates",
        });
        continue;
      }
      const externalId = row.suggestions[0].externalId;
      if (usedApiIds.has(externalId)) {
        skippedDuplicateApiId++;
        ambiguous.push({
          playerId: row.playerId,
          playerName: row.playerName,
          reason: "Duplicate CricAPI player (already auto-mapped to another roster player)",
        });
        continue;
      }
      usedApiIds.add(externalId);
      mappedPairs.push({ playerId: row.playerId, externalId });
    }

    if (mappedPairs.length === 0) {
      return NextResponse.json({
        dryRun,
        mapped: 0,
        skippedDuplicateApiId,
        skippedNotEligible,
        ambiguous,
        mappings: [],
        message: "No rows met auto-map confidence rules",
        squadCount: squadPlayers.length,
      });
    }

    if (!dryRun) {
      await prisma.$transaction(
        mappedPairs.map((m) =>
          prisma.player.update({
            where: { id: m.playerId },
            data: { externalId: m.externalId },
          })
        )
      );
    }

    return NextResponse.json({
      dryRun,
      mapped: mappedPairs.length,
      skippedDuplicateApiId,
      skippedNotEligible,
      ambiguous,
      mappings: mappedPairs,
      squadCount: squadPlayers.length,
    });
  } catch (err) {
    console.error("POST /api/leagues/[id]/players/map/auto error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
