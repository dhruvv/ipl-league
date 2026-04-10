/**
 * Tracks recent browser activity (scoring EventSource) so the poller can use a
 * fast interval only while members have the app open — otherwise CricAPI is polled slowly.
 */

let activeUntilMs = 0;

function audienceGraceMs(): number {
  const raw = process.env.SCORING_AUDIENCE_GRACE_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 15_000) return n;
  }
  return 90_000;
}

/** Extend the “someone is watching” window (SSE connect or keepalive). */
export function touchScoringAudience(): void {
  const until = Date.now() + audienceGraceMs();
  if (until > activeUntilMs) activeUntilMs = until;
}

export function isScoringAudienceActive(): boolean {
  return Date.now() < activeUntilMs;
}
