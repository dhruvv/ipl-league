import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireLeagueMember } from "@/lib/auction-helpers";
import { fetchMatchScorecard, fetchMatchSquad } from "@/lib/cricapi";
import { getScoringPollTimezone, calendarDateInTz, isMatchOnCalendarDay } from "@/lib/scoring-poll-schedule";
import { externalIdsSeenInScorecard } from "@/lib/squad-playing";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leagueId } = await params;
    const session = await auth();
    if (!session?.user?.id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const member = await requireLeagueMember(leagueId, session.user.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const tz = getScoringPollTimezone();
    const today = calendarDateInTz(new Date(), tz);

    const dayMatches = await prisma.leagueMatch.findMany({
      where: { leagueId },
      orderBy: { matchDate: "asc" },
    });

    const matchesToday = dayMatches.filter(
      (m) => m.matchDate && isMatchOnCalendarDay(m.matchDate, today, tz)
    );

    const localPlayers = await prisma.player.findMany({
      where: { leagueId, externalId: { not: null } },
      select: { id: true, name: true, externalId: true },
    });
    const extToLocal = new Map(
      localPlayers
        .filter((p) => p.externalId)
        .map((p) => [p.externalId!.toLowerCase(), { id: p.id, name: p.name }])
    );

    const out: {
      leagueMatchId: string;
      externalMatchId: string;
      team1: string;
      team2: string;
      status: string;
      matchDate: string | null;
      note: string | null;
      squads: {
        teamName: string;
        shortname: string;
        players: {
          externalId: string;
          name: string;
          country: string;
          mappedLeaguePlayerId: string | null;
          mappedLeaguePlayerName: string | null;
          appearedInScorecard: boolean;
        }[];
      }[];
    }[] = [];

    for (const lm of matchesToday) {
      let inScore = new Set<string>();
      let scorecardError: string | null = null;
      if (process.env.CRICAPI_KEY) {
        try {
          const sc = await fetchMatchScorecard(lm.externalMatchId);
          inScore = externalIdsSeenInScorecard(sc);
        } catch {
          scorecardError = "scorecard unavailable";
        }
      }

      let squads: Awaited<ReturnType<typeof fetchMatchSquad>> = [];
      if (process.env.CRICAPI_KEY) {
        try {
          squads = await fetchMatchSquad(lm.externalMatchId);
        } catch {
          squads = [];
        }
      }

      const hasScorecardPlayers = inScore.size > 0;
      const note =
        !process.env.CRICAPI_KEY
          ? "CRICAPI_KEY not set"
          : squads.length === 0
            ? "No squad data for this match id"
            : hasScorecardPlayers
              ? "Players marked “in scorecard” bat, bowl, or catch in this match (approximation of playing XI + subs used)."
              : "Match not started or no scorecard yet — full squad lists; XI is usually confirmed at toss.";

      out.push({
        leagueMatchId: lm.id,
        externalMatchId: lm.externalMatchId,
        team1: lm.team1,
        team2: lm.team2,
        status: lm.status,
        matchDate: lm.matchDate?.toISOString() ?? null,
        note: scorecardError ?? note,
        squads: squads.map((s) => ({
          teamName: s.teamName,
          shortname: s.shortname,
          players: s.players.map((p) => {
            const eid = p.id.toLowerCase();
            const mapped = extToLocal.get(eid);
            return {
              externalId: p.id,
              name: p.name,
              country: p.country,
              mappedLeaguePlayerId: mapped?.id ?? null,
              mappedLeaguePlayerName: mapped?.name ?? null,
              appearedInScorecard: inScore.has(eid),
            };
          }),
        })),
      });
    }

    return NextResponse.json({
      calendarDate: today,
      timeZone: tz,
      matches: out,
    });
  } catch (err) {
    console.error("GET squads/today error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
