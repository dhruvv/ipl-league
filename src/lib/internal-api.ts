/** Bearer secret for cron/internal routes (e.g. reconcile-scrape). */
export function scoringSyncSecretMatches(req: Request): boolean {
  const secret = process.env.SCORING_SYNC_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
