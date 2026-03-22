import { EventEmitter } from "events";

export type AuctionEventType =
  | "auction-started"
  | "auction-paused"
  | "auction-resumed"
  | "auction-ended"
  | "pot-selected"
  | "player-active"
  | "bidding-open"
  | "bid-placed"
  | "bidding-closed"
  | "player-skipped"
  | "sale-undone"
  | "state-sync";

export interface AuctionEvent {
  type: AuctionEventType;
  leagueId: string;
  data: unknown;
  timestamp: number;
}

class AuctionEmitter {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  emit(leagueId: string, type: AuctionEventType, data: unknown) {
    const event: AuctionEvent = {
      type,
      leagueId,
      data,
      timestamp: Date.now(),
    };
    this.emitter.emit(`auction:${leagueId}`, event);
  }

  subscribe(
    leagueId: string,
    listener: (event: AuctionEvent) => void
  ): () => void {
    const channel = `auction:${leagueId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }
}

const globalForAuction = globalThis as unknown as {
  auctionEmitter: AuctionEmitter | undefined;
};

export const auctionEmitter =
  globalForAuction.auctionEmitter ?? new AuctionEmitter();

if (process.env.NODE_ENV !== "production") {
  globalForAuction.auctionEmitter = auctionEmitter;
}
