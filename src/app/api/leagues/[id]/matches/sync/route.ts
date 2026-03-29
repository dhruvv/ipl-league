import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { cricApiErrorHttpPayload, fetchSeriesInfo } from "@/lib/cricapi";

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
    const seriesId = body.seriesId as string;

    if (!seriesId) {
      return NextResponse.json(
        { error: "seriesId is required" },
        { status: 400 }
      );
    }

    const seriesInfo = await fetchSeriesInfo(seriesId);

    const matchListSorted = [...seriesInfo.matchList].sort((a, b) => {
      const ta = a.dateTimeGMT ? new Date(a.dateTimeGMT).getTime() : NaN;
      const tb = b.dateTimeGMT ? new Date(b.dateTimeGMT).getTime() : NaN;
      if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
      if (Number.isFinite(ta)) return -1;
      if (Number.isFinite(tb)) return 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    await prisma.league.update({
      where: { id: leagueId },
      data: { cricapiSeriesId: seriesId },
    });

    let created = 0;
    let skipped = 0;

    for (const match of matchListSorted) {
      const existing = await prisma.leagueMatch.findUnique({
        where: {
          leagueId_externalMatchId: {
            leagueId,
            externalMatchId: match.id,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const teams = match.teams ?? [];

      await prisma.leagueMatch.create({
        data: {
          leagueId,
          externalMatchId: match.id,
          team1: teams[0] ?? "TBD",
          team2: teams[1] ?? "TBD",
          status: match.matchEnded
            ? "COMPLETED"
            : match.matchStarted
              ? "LIVE"
              : "UPCOMING",
          matchDate: match.dateTimeGMT
            ? new Date(match.dateTimeGMT)
            : null,
        },
      });
      created++;
    }

    return NextResponse.json({
      seriesName: seriesInfo.info.name,
      totalMatches: matchListSorted.length,
      created,
      skipped,
    });
  } catch (err) {
    console.error("POST /api/leagues/[id]/matches/sync error:", err);
    const mapped = cricApiErrorHttpPayload(err);
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
