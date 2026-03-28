import { prisma } from "./prisma";
import { fetchMatchScorecard, fetchMatchPoints } from "./cricapi";
import { calculateMatchFantasyPoints } from "./scoring";
import { scoringEmitter } from "./scoring-events";
import type { ScoringRules } from "./scoring";
import { aggregateFantasyPointsByPlayerId } from "./match-points";
import {
  calendarDateInTz,
  getScoringPollTimezone,
  inScoringPollWindow,
  isMatchOnCalendarDay,
} from "./scoring-poll-schedule";

const LIVE_POLL_INTERVAL = 30_000;
const IDLE_POLL_INTERVAL = 300_000;

function idleOutsideWindowMs(): number {
  const raw = process.env.SCORING_POLL_IDLE_OUTSIDE_WINDOW_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 60_000) return n;
  }
  return 3_600_000;
}

class ScoringPoller {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;
    console.log("[ScoringPoller] Started");
    this.scheduleNext(5_000);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[ScoringPoller] Stopped");
  }

  private scheduleNext(ms: number) {
    if (!this.running) return;
    this.timer = setTimeout(() => this.poll(), ms);
  }

  private async poll() {
    if (!this.running) return;

    let hasLiveMatches = false;
    let wantFastInterval = false;
    const tz = getScoringPollTimezone();
    const todayYmd = calendarDateInTz(new Date(), tz);
    const inWindow = inScoringPollWindow();

    try {
      if (!process.env.CRICAPI_KEY) {
        this.scheduleNext(inWindow ? IDLE_POLL_INTERVAL : idleOutsideWindowMs());
        return;
      }

      const activeLeagues = await prisma.league.findMany({
        where: { phase: "LEAGUE_ACTIVE" },
        select: {
          id: true,
          scoringTopN: true,
          scoringRules: true,
          cricapiFantasyRulesetId: true,
        },
      });

      if (activeLeagues.length === 0) {
        this.scheduleNext(inWindow ? IDLE_POLL_INTERVAL : idleOutsideWindowMs());
        return;
      }

      for (const league of activeLeagues) {
        const liveMatches = await prisma.leagueMatch.findMany({
          where: { leagueId: league.id, status: "LIVE" },
          select: { id: true, externalMatchId: true },
        });

        if (liveMatches.length > 0) hasLiveMatches = true;

        const upcomingRows = await prisma.leagueMatch.findMany({
          where: { leagueId: league.id, status: "UPCOMING" },
          select: { matchDate: true },
        });
        const hasUpcomingToday = upcomingRows.some(
          (row) =>
            row.matchDate != null &&
            isMatchOnCalendarDay(row.matchDate, todayYmd, tz)
        );

        if (
          inWindow &&
          (liveMatches.length > 0 || hasUpcomingToday)
        ) {
          wantFastInterval = true;
        }

        for (const match of liveMatches) {
          try {
            await this.updateMatch(
              league.id,
              match.id,
              match.externalMatchId,
              league.scoringRules as Partial<ScoringRules> | null,
              league.cricapiFantasyRulesetId
            );
          } catch (err) {
            console.error(`[ScoringPoller] Error updating match ${match.externalMatchId}:`, err);
          }
        }

        const upcomingMatches = await prisma.leagueMatch.findMany({
          where: { leagueId: league.id, status: "UPCOMING" },
          select: { id: true, externalMatchId: true, matchDate: true },
        });

        for (const match of upcomingMatches) {
          if (match.matchDate && match.matchDate <= new Date()) {
            try {
              const sc = await fetchMatchScorecard(match.externalMatchId);
              if (sc.score && sc.score.length > 0) {
                await prisma.leagueMatch.update({
                  where: { id: match.id },
                  data: { status: "LIVE" },
                });
                hasLiveMatches = true;
                scoringEmitter.emit(league.id, "match-started", {
                  matchId: match.id,
                  externalMatchId: match.externalMatchId,
                });
              }
            } catch {
              // match not started yet
            }
          }
        }
      }
    } catch (err) {
      console.error("[ScoringPoller] Poll error:", err);
    }

    const useFast =
      hasLiveMatches || wantFastInterval;
    const nextMs = useFast
      ? LIVE_POLL_INTERVAL
      : inWindow
        ? IDLE_POLL_INTERVAL
        : idleOutsideWindowMs();
    this.scheduleNext(nextMs);
  }

  private async updateMatch(
    leagueId: string,
    matchId: string,
    externalMatchId: string,
    scoringRulesOverride: Partial<ScoringRules> | null,
    cricapiFantasyRulesetId: string | null
  ) {
    const scorecard = await fetchMatchScorecard(externalMatchId);
    const isCompleted = scorecard.matchWinner && scorecard.matchWinner !== "";

    if (!scorecard.scorecard || scorecard.scorecard.length === 0) return;

    const mappedPlayers = await prisma.player.findMany({
      where: { league: { id: leagueId }, externalId: { not: null } },
      select: { id: true, externalId: true, position: true },
    });

    const externalToLocal = new Map(
      mappedPlayers
        .filter((p) => p.externalId)
        .map((p) => [p.externalId!.toLowerCase(), p.id])
    );

    const playerMetaByExternalId = new Map<
      string,
      { position?: string | null }
    >(
      mappedPlayers
        .filter((p) => p.externalId)
        .map((p) => [
          p.externalId!.toLowerCase(),
          { position: p.position },
        ])
    );

    const playerStats = calculateMatchFantasyPoints(
      scorecard.scorecard,
      scoringRulesOverride,
      playerMetaByExternalId
    );

    let fantasyFromApi: Map<string, number> | null = null;
    try {
      const mp = await fetchMatchPoints(externalMatchId, {
        rulesetId: cricapiFantasyRulesetId,
      });
      const raw = aggregateFantasyPointsByPlayerId(mp);
      fantasyFromApi = new Map(
        [...raw.entries()].map(([k, v]) => [k.toLowerCase(), v])
      );
    } catch (err) {
      console.warn(
        `[ScoringPoller] match_points unavailable for ${externalMatchId}, using in-app scoring:`,
        err
      );
    }

    for (const stat of playerStats) {
      const localPlayerId = externalToLocal.get(stat.externalId.toLowerCase());
      if (!localPlayerId) continue;

      const apiPts = fantasyFromApi?.get(stat.externalId.toLowerCase());
      const fantasyPoints =
        apiPts !== undefined && apiPts !== null ? apiPts : stat.fantasyPoints;

      await prisma.playerPerformance.upsert({
        where: { playerId_matchId: { playerId: localPlayerId, matchId } },
        create: {
          playerId: localPlayerId,
          matchId,
          runsScored: stat.runsScored,
          ballsFaced: stat.ballsFaced,
          fours: stat.fours,
          sixes: stat.sixes,
          wicketsTaken: stat.wicketsTaken,
          oversBowled: stat.oversBowled,
          runsConceded: stat.runsConceded,
          maidens: stat.maidens,
          catches: stat.catches,
          stumpings: stat.stumpings,
          runOuts: stat.runOuts,
          dotBalls: stat.dotBalls,
          strikeRate: stat.strikeRate,
          economyRate: stat.economyRate,
          fantasyPoints,
          isDuck: stat.isDuck,
          isOut: stat.isOut,
        },
        update: {
          runsScored: stat.runsScored,
          ballsFaced: stat.ballsFaced,
          fours: stat.fours,
          sixes: stat.sixes,
          wicketsTaken: stat.wicketsTaken,
          oversBowled: stat.oversBowled,
          runsConceded: stat.runsConceded,
          maidens: stat.maidens,
          catches: stat.catches,
          stumpings: stat.stumpings,
          runOuts: stat.runOuts,
          dotBalls: stat.dotBalls,
          strikeRate: stat.strikeRate,
          economyRate: stat.economyRate,
          fantasyPoints,
          isDuck: stat.isDuck,
          isOut: stat.isOut,
        },
      });
    }

    if (isCompleted) {
      await prisma.leagueMatch.update({
        where: { id: matchId },
        data: { status: "COMPLETED" },
      });
      scoringEmitter.emit(leagueId, "match-completed", {
        matchId,
        externalMatchId,
      });
    }

    scoringEmitter.emit(leagueId, "score-update", {
      matchId,
      externalMatchId,
      playerCount: playerStats.length,
    });
  }
}

const globalForPoller = globalThis as unknown as {
  scoringPoller: ScoringPoller | undefined;
};

export const scoringPoller =
  globalForPoller.scoringPoller ?? new ScoringPoller();

if (process.env.NODE_ENV !== "production") {
  globalForPoller.scoringPoller = scoringPoller;
}
