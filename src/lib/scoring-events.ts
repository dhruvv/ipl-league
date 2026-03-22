import { EventEmitter } from "events";

export type ScoringEventType =
  | "score-update"
  | "match-started"
  | "match-completed"
  | "state-sync";

export interface ScoringEvent {
  type: ScoringEventType;
  leagueId: string;
  data: unknown;
  timestamp: number;
}

class ScoringEmitter {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  emit(leagueId: string, type: ScoringEventType, data: unknown) {
    const event: ScoringEvent = {
      type,
      leagueId,
      data,
      timestamp: Date.now(),
    };
    this.emitter.emit(`scoring:${leagueId}`, event);
  }

  subscribe(
    leagueId: string,
    listener: (event: ScoringEvent) => void
  ): () => void {
    const channel = `scoring:${leagueId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

const globalForScoring = globalThis as unknown as {
  scoringEmitter: ScoringEmitter | undefined;
};

export const scoringEmitter =
  globalForScoring.scoringEmitter ?? new ScoringEmitter();

if (process.env.NODE_ENV !== "production") {
  globalForScoring.scoringEmitter = scoringEmitter;
}
