import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv } from "@/lib/csv-parser";
import { fetchSheetCsv } from "@/lib/sheets";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.leagueMember.findUnique({
    where: {
      leagueId_userId: { leagueId, userId: session.user.id },
    },
  });

  if (!member || member.role !== "OWNER") {
    return NextResponse.json({ error: "Only the league owner can import players" }, { status: 403 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { phase: true },
  });

  if (!league || league.phase !== "SETUP") {
    return NextResponse.json(
      { error: "Players can only be imported during the SETUP phase" },
      { status: 400 }
    );
  }

  try {
    let csvText: string;
    let sheetUrl: string | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      const body = await req.json();
      if (!body.sheetUrl) {
        return NextResponse.json({ error: "No sheet URL provided" }, { status: 400 });
      }
      sheetUrl = body.sheetUrl;
      csvText = await fetchSheetCsv(body.sheetUrl);
    }

    const { players, errors } = parseCsv(csvText);

    if (players.length === 0) {
      return NextResponse.json(
        { imported: 0, errors: errors.length > 0 ? errors : ["No valid players found in CSV"] },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.player.deleteMany({
        where: { leagueId, status: "QUEUED" },
      });

      await tx.player.createMany({
        data: players.map((p) => ({
          leagueId,
          slNo: p.slNo,
          name: p.name,
          basePrice: p.basePrice,
          position: p.position,
          country: p.country,
          bowlingStyle: p.bowlingStyle,
          battingStyle: p.battingStyle,
          iplTeam: p.iplTeam,
          pot: p.pot,
          soldPrice: p.soldPrice,
          status: "QUEUED" as const,
        })),
      });

      if (sheetUrl) {
        await tx.league.update({
          where: { id: leagueId },
          data: { sheetUrl },
        });
      }
    });

    return NextResponse.json({
      imported: players.length,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
