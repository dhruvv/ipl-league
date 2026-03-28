import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { scoringSyncSecretMatches } from "@/lib/internal-api";
import { reconcileMatchesFromScrape } from "@/lib/match-reconcile-scrape";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;

    const session = await auth();
    const bearerOk = scoringSyncSecretMatches(req);
    let admin = null as Awaited<ReturnType<typeof requireAuctionAdmin>>;
    if (session?.user?.id) {
      admin = await requireAuctionAdmin(leagueId, session.user.id);
    }

    if (!bearerOk && !admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: session?.user?.id ? 403 : 401 }
      );
    }

    const body = await req.json();
    const matches = body.matches as { externalMatchId: string }[];
    const force = Boolean(body.force);

    if (!Array.isArray(matches)) {
      return NextResponse.json(
        { error: "matches array required" },
        { status: 400 }
      );
    }

    await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });

    const result = await reconcileMatchesFromScrape({
      leagueId,
      matches,
      force,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("POST reconcile-scrape error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
