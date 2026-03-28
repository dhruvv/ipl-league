import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireAuctionAdmin } from "@/lib/auction-helpers";

/**
 * Persist cricketdata.org fantasy ruleset id (member area) for match_points API.
 * Falls back to CRICAPI_FANTASY_RULESET_ID env when league field is null.
 */
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
    const raw = body.cricapiFantasyRulesetId;
    const cricapiFantasyRulesetId =
      raw === null || raw === undefined
        ? null
        : typeof raw === "string" && raw.trim() === ""
          ? null
          : String(raw).trim();

    await prisma.league.update({
      where: { id: leagueId },
      data: { cricapiFantasyRulesetId },
    });

    return NextResponse.json({ cricapiFantasyRulesetId });
  } catch (err) {
    console.error("POST /api/leagues/[id]/fantasy-ruleset error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
