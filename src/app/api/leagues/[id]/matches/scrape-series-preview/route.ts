import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAuctionAdmin } from "@/lib/auction-helpers";
import { fetchSeriesPageMatchIds } from "@/lib/cricketdata-series-page";

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
    const url = String(body.url ?? "").trim();
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      return NextResponse.json({ error: "url must be http(s)" }, { status: 400 });
    }

    const matches = await fetchSeriesPageMatchIds(url);
    return NextResponse.json({ matches, count: matches.length });
  } catch (err) {
    console.error("scrape-series-preview error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
