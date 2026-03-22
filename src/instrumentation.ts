export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { scoringPoller } = await import("./lib/scoring-poller");
      scoringPoller.start();
    } catch (err) {
      console.error("[Instrumentation] Failed to start scoring poller:", err);
    }
  }
}
