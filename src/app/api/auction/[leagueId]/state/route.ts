import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireLeagueMember, getAuctionState } from "@/lib/auction-helpers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await requireLeagueMember(leagueId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const state = await getAuctionState(leagueId);
  return NextResponse.json(state);
}
