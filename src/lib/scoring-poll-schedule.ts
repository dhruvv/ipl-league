/**
 * Pacific (etc.) polling windows for CricAPI usage — see SCORING_POLL_* env vars.
 */

function parseHm(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function minutesSinceMidnightInTz(now: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function getScoringPollTimezone(): string {
  return process.env.SCORING_POLL_TZ?.trim() || "America/Los_Angeles";
}

export function inScoringPollWindow(now: Date = new Date()): boolean {
  const tz = getScoringPollTimezone();
  const startS = process.env.SCORING_POLL_WINDOW_START?.trim() || "03:00";
  const endS = process.env.SCORING_POLL_WINDOW_END?.trim() || "16:00";
  const start = parseHm(startS);
  const end = parseHm(endS);
  if (!start || !end) return true;

  const cur = minutesSinceMidnightInTz(now, tz);
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;

  if (startMin <= endMin) {
    return cur >= startMin && cur <= endMin;
  }
  return cur >= startMin || cur <= endMin;
}

/** Calendar date YYYY-MM-DD in `timeZone` for `date`. */
export function calendarDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Start of that calendar day in UTC as a Date (interpreted in tz — approximate using noon UTC trick). */
export function isMatchOnCalendarDay(
  matchDate: Date | null,
  dayYmd: string,
  timeZone: string
): boolean {
  if (!matchDate) return false;
  return calendarDateInTz(matchDate, timeZone) === dayYmd;
}
