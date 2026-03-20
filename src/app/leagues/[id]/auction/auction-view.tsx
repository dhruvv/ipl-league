"use client";

import { useReducer, useEffect, useCallback } from "react";
import { AdminControls } from "./auction-admin-controls";
import { PlayerCard } from "./player-card";
import { BidPanel } from "./bid-panel";
import { TeamSidebar } from "./team-sidebar";
import { AuctionLog } from "./auction-log";

export interface AuctionPlayer {
  id: string;
  slNo: number | null;
  name: string;
  position: string | null;
  country: string;
  bowlingStyle: string | null;
  battingStyle: string | null;
  iplTeam: string | null;
  basePrice: number;
  pot: string;
  status: string;
  soldTo: string | null;
  soldPrice: number | null;
}

export interface BidEntry {
  id: string;
  amount: number;
  userId: string;
  username: string;
  createdAt: string;
}

export interface BudgetInfo {
  userId: string;
  username: string;
  totalBudget: number;
  spent: number;
  remaining: number;
  overseasCount: number;
  playerCount: number;
}

export interface SoldEntry {
  playerId: string;
  playerName: string;
  soldTo: string | null;
  buyerName: string;
  soldPrice: number | null;
}

export interface AuctionState {
  connected: boolean;
  phase: string;
  pots: string[];
  currentPot: string | null;
  currentPlayerIndex: number;
  potPlayers: AuctionPlayer[];
  currentPlayer: AuctionPlayer | null;
  currentBids: BidEntry[];
  budgets: BudgetInfo[];
  soldLog: SoldEntry[];
  players: AuctionPlayer[];
  overseasCap: number;
}

type AuctionAction =
  | { type: "STATE_SYNC"; payload: AuctionState }
  | { type: "SET_CONNECTED"; connected: boolean }
  | { type: "AUCTION_STARTED"; phase: string }
  | {
      type: "POT_SELECTED";
      pot: string;
      currentPlayerIndex: number;
      currentPlayerId: string;
    }
  | { type: "PLAYER_ACTIVE"; currentPlayerIndex: number; currentPlayerId: string }
  | { type: "BIDDING_OPEN"; playerId: string }
  | { type: "BID_PLACED"; bid: BidEntry }
  | {
      type: "BIDDING_CLOSED";
      playerId: string;
      result: string;
      soldTo?: string;
      buyerName?: string;
      soldPrice?: number;
      playerName?: string;
    }
  | { type: "PLAYER_SKIPPED"; playerId: string }
  | { type: "SALE_UNDONE"; playerId: string; playerName: string }
  | { type: "FULL_REFRESH"; payload: AuctionState };

const initialState: AuctionState = {
  connected: false,
  phase: "SETUP",
  pots: [],
  currentPot: null,
  currentPlayerIndex: 0,
  potPlayers: [],
  currentPlayer: null,
  currentBids: [],
  budgets: [],
  soldLog: [],
  players: [],
  overseasCap: 4,
};

function auctionReducer(
  state: AuctionState,
  action: AuctionAction
): AuctionState {
  switch (action.type) {
    case "STATE_SYNC":
    case "FULL_REFRESH":
      return { ...action.payload, connected: true };

    case "SET_CONNECTED":
      return { ...state, connected: action.connected };

    case "AUCTION_STARTED":
      return { ...state, phase: action.phase };

    case "POT_SELECTED": {
      const potPlayers = state.players.filter(
        (p) => p.pot === action.pot
      );
      const current =
        potPlayers.find((p) => p.id === action.currentPlayerId) ?? null;
      return {
        ...state,
        currentPot: action.pot,
        currentPlayerIndex: action.currentPlayerIndex,
        potPlayers,
        currentPlayer: current
          ? { ...current, status: "ACTIVE" }
          : null,
        currentBids: [],
      };
    }

    case "PLAYER_ACTIVE": {
      const current =
        state.players.find((p) => p.id === action.currentPlayerId) ?? null;
      return {
        ...state,
        currentPlayerIndex: action.currentPlayerIndex,
        currentPlayer: current
          ? {
              ...current,
              status:
                current.status === "SOLD" || current.status === "UNSOLD"
                  ? current.status
                  : "ACTIVE",
            }
          : null,
        currentBids: [],
      };
    }

    case "BIDDING_OPEN": {
      if (!state.currentPlayer) return state;
      return {
        ...state,
        currentPlayer: { ...state.currentPlayer, status: "BIDDING_OPEN" },
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, status: "BIDDING_OPEN" } : p
        ),
      };
    }

    case "BID_PLACED":
      return {
        ...state,
        currentBids: [action.bid, ...state.currentBids],
      };

    case "BIDDING_CLOSED": {
      const updatedPlayers = state.players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              status: action.result,
              soldTo: action.soldTo ?? null,
              soldPrice: action.soldPrice ?? null,
            }
          : p
      );

      const newSoldLog =
        action.result === "SOLD"
          ? [
              ...state.soldLog,
              {
                playerId: action.playerId,
                playerName: action.playerName ?? "",
                soldTo: action.soldTo ?? null,
                buyerName: action.buyerName ?? "Unknown",
                soldPrice: action.soldPrice ?? null,
              },
            ]
          : state.soldLog;

      const updatedBudgets =
        action.result === "SOLD" && action.soldTo && action.soldPrice
          ? state.budgets.map((b) =>
              b.userId === action.soldTo
                ? {
                    ...b,
                    spent: b.spent + (action.soldPrice ?? 0),
                    remaining: b.remaining - (action.soldPrice ?? 0),
                    playerCount: b.playerCount + 1,
                    overseasCount:
                      state.currentPlayer?.country !== "India"
                        ? b.overseasCount + 1
                        : b.overseasCount,
                  }
                : b
            )
          : state.budgets;

      return {
        ...state,
        players: updatedPlayers,
        currentPlayer: state.currentPlayer
          ? {
              ...state.currentPlayer,
              status: action.result,
              soldTo: action.soldTo ?? null,
              soldPrice: action.soldPrice ?? null,
            }
          : null,
        soldLog: newSoldLog,
        budgets: updatedBudgets,
        potPlayers: state.potPlayers.map((p) =>
          p.id === action.playerId
            ? {
                ...p,
                status: action.result,
                soldTo: action.soldTo ?? null,
                soldPrice: action.soldPrice ?? null,
              }
            : p
        ),
      };
    }

    case "PLAYER_SKIPPED": {
      const updatedPlayers = state.players.map((p) =>
        p.id === action.playerId ? { ...p, status: "UNSOLD" } : p
      );
      return {
        ...state,
        players: updatedPlayers,
        potPlayers: state.potPlayers.map((p) =>
          p.id === action.playerId ? { ...p, status: "UNSOLD" } : p
        ),
      };
    }

    case "SALE_UNDONE": {
      const updatedPlayers = state.players.map((p) =>
        p.id === action.playerId
          ? { ...p, status: "QUEUED", soldTo: null, soldPrice: null }
          : p
      );
      return {
        ...state,
        players: updatedPlayers,
        soldLog: state.soldLog.filter(
          (s) => s.playerId !== action.playerId
        ),
        potPlayers: state.potPlayers.map((p) =>
          p.id === action.playerId
            ? { ...p, status: "QUEUED", soldTo: null, soldPrice: null }
            : p
        ),
      };
    }

    default:
      return state;
  }
}

interface AuctionViewProps {
  leagueId: string;
  userId: string;
  isAdmin: boolean;
  members: {
    id: string;
    userId: string;
    username: string;
    role: string;
  }[];
}

export function AuctionView({
  leagueId,
  userId,
  isAdmin,
  members,
}: AuctionViewProps) {
  const [state, dispatch] = useReducer(auctionReducer, initialState);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/auction/${leagueId}/stream`
    );

    eventSource.addEventListener("state-sync", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "STATE_SYNC",
        payload: {
          connected: true,
          phase: data.league.phase,
          pots: data.pots,
          currentPot: data.league.currentPot,
          currentPlayerIndex: data.league.currentPlayerIndex,
          potPlayers: data.potPlayers,
          currentPlayer: data.currentPlayer,
          currentBids: data.currentBids,
          budgets: data.budgets,
          soldLog: data.soldLog,
          players: data.players,
          overseasCap: data.league.overseasCap,
        },
      });
    });

    eventSource.addEventListener("auction-started", (e) => {
      const data = JSON.parse(e.data);
      dispatch({ type: "AUCTION_STARTED", phase: data.phase });
    });

    eventSource.addEventListener("pot-selected", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "POT_SELECTED",
        pot: data.pot,
        currentPlayerIndex: data.currentPlayerIndex,
        currentPlayerId: data.currentPlayerId,
      });
    });

    eventSource.addEventListener("player-active", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "PLAYER_ACTIVE",
        currentPlayerIndex: data.currentPlayerIndex,
        currentPlayerId: data.currentPlayerId,
      });
    });

    eventSource.addEventListener("bidding-open", (e) => {
      const data = JSON.parse(e.data);
      dispatch({ type: "BIDDING_OPEN", playerId: data.playerId });
    });

    eventSource.addEventListener("bid-placed", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "BID_PLACED",
        bid: {
          id: data.bidId,
          amount: data.amount,
          userId: data.userId,
          username: data.username,
          createdAt: new Date().toISOString(),
        },
      });
    });

    eventSource.addEventListener("bidding-closed", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "BIDDING_CLOSED",
        playerId: data.playerId,
        result: data.result,
        soldTo: data.soldTo,
        buyerName: data.buyerName,
        soldPrice: data.soldPrice,
        playerName: data.playerName,
      });
    });

    eventSource.addEventListener("player-skipped", (e) => {
      const data = JSON.parse(e.data);
      dispatch({ type: "PLAYER_SKIPPED", playerId: data.playerId });
    });

    eventSource.addEventListener("sale-undone", (e) => {
      const data = JSON.parse(e.data);
      dispatch({
        type: "SALE_UNDONE",
        playerId: data.playerId,
        playerName: data.playerName,
      });
    });

    eventSource.onopen = () => {
      dispatch({ type: "SET_CONNECTED", connected: true });
    };

    eventSource.onerror = () => {
      dispatch({ type: "SET_CONNECTED", connected: false });
    };

    return () => {
      eventSource.close();
    };
  }, [leagueId]);

  const refreshState = useCallback(async () => {
    const res = await fetch(`/api/auction/${leagueId}/state`);
    if (res.ok) {
      const data = await res.json();
      dispatch({
        type: "FULL_REFRESH",
        payload: {
          connected: true,
          phase: data.league.phase,
          pots: data.pots,
          currentPot: data.league.currentPot,
          currentPlayerIndex: data.league.currentPlayerIndex,
          potPlayers: data.potPlayers,
          currentPlayer: data.currentPlayer,
          currentBids: data.currentBids,
          budgets: data.budgets,
          soldLog: data.soldLog,
          players: data.players,
          overseasCap: data.league.overseasCap,
        },
      });
    }
  }, [leagueId]);

  const myBudget = state.budgets.find((b) => b.userId === userId);
  const highestBid =
    state.currentBids.length > 0 ? state.currentBids[0] : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-y-auto p-4 lg:p-6">
        {!state.connected && (
          <div className="mb-4 rounded-lg bg-amber-900/50 px-4 py-2 text-sm text-amber-300">
            Reconnecting to auction stream...
          </div>
        )}

        {isAdmin && (
          <AdminControls
            leagueId={leagueId}
            state={state}
            members={members}
            onRefresh={refreshState}
          />
        )}

        {state.phase === "SETUP" && !isAdmin && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-gray-400">
              Waiting for the auctioneer to start the auction...
            </p>
          </div>
        )}

        {state.phase === "AUCTION_ACTIVE" && (
          <div className="mt-4 space-y-4">
            <PlayerCard
              player={state.currentPlayer}
              highestBid={highestBid}
              potPlayers={state.potPlayers}
              currentIndex={state.currentPlayerIndex}
            />

            {state.currentPlayer?.status === "BIDDING_OPEN" && (
              <BidPanel
                leagueId={leagueId}
                currentPlayer={state.currentPlayer}
                highestBid={highestBid}
                myBudget={myBudget ?? null}
                overseasCap={state.overseasCap}
              />
            )}

            {state.currentBids.length > 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h3 className="mb-3 text-sm font-medium text-gray-400">
                  Bids for Current Player
                </h3>
                <div className="space-y-1.5">
                  {state.currentBids.map((bid, i) => (
                    <div
                      key={bid.id}
                      className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                        i === 0
                          ? "bg-emerald-900/30 text-emerald-300"
                          : "text-gray-400"
                      }`}
                    >
                      <span className="font-medium">{bid.username}</span>
                      <span className="tabular-nums">
                        {bid.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state.phase === "AUCTION_COMPLETE" && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-lg text-gray-400">Auction complete!</p>
          </div>
        )}

        {state.soldLog.length > 0 && (
          <div className="mt-6">
            <AuctionLog soldLog={state.soldLog} />
          </div>
        )}
      </div>

      <TeamSidebar
        budgets={state.budgets}
        userId={userId}
        players={state.players}
        overseasCap={state.overseasCap}
      />
    </div>
  );
}
