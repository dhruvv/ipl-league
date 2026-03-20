"use client";

import { useReducer, useEffect, useCallback } from "react";
import { AdminControls } from "./auction-admin-controls";
import { PlayerCard } from "./player-card";
import { BidPanel } from "./bid-panel";
import { TeamSidebar } from "./team-sidebar";
import { AuctionLog } from "./auction-log";
import { UpcomingPlayers } from "./upcoming-players";

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
  soldToTeamId: string | null;
  soldPrice: number | null;
}

export interface BidEntry {
  id: string;
  amount: number;
  userId: string;
  username: string;
  teamId: string | null;
  teamName: string | null;
  createdAt: string;
}

export interface TeamBudgetInfo {
  teamId: string;
  teamName: string;
  memberUserIds: string[];
  totalBudget: number;
  spent: number;
  remaining: number;
  overseasCount: number;
  playerCount: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  memberUserIds: string[];
}

export interface SoldEntry {
  playerId: string;
  playerName: string;
  soldToTeamId: string | null;
  teamName: string;
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
  budgets: TeamBudgetInfo[];
  soldLog: SoldEntry[];
  players: AuctionPlayer[];
  overseasCap: number;
  minBidIncrement: number;
  teams: TeamInfo[];
  upcomingPlayers: AuctionPlayer[];
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
      soldToTeamId?: string;
      teamName?: string;
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
  minBidIncrement: 10000000,
  teams: [],
  upcomingPlayers: [],
};

function deriveUpcoming(
  players: AuctionPlayer[],
  currentPot: string | null,
  currentPlayerIndex: number
): AuctionPlayer[] {
  if (!currentPot) return [];
  const potPlayers = players.filter((p) => p.pot === currentPot);
  return potPlayers
    .slice(currentPlayerIndex + 1)
    .filter((p) => p.status !== "SOLD" && p.status !== "UNSOLD")
    .slice(0, 5);
}

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
      const upcoming = deriveUpcoming(state.players, action.pot, action.currentPlayerIndex);
      return {
        ...state,
        currentPot: action.pot,
        currentPlayerIndex: action.currentPlayerIndex,
        potPlayers,
        currentPlayer: current
          ? { ...current, status: "ACTIVE" }
          : null,
        currentBids: [],
        upcomingPlayers: upcoming,
      };
    }

    case "PLAYER_ACTIVE": {
      const current =
        state.players.find((p) => p.id === action.currentPlayerId) ?? null;
      const upcoming = deriveUpcoming(state.players, state.currentPot, action.currentPlayerIndex);
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
        upcomingPlayers: upcoming,
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
              soldToTeamId: action.soldToTeamId ?? null,
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
                soldToTeamId: action.soldToTeamId ?? null,
                teamName: action.teamName ?? "Unknown",
                soldPrice: action.soldPrice ?? null,
              },
            ]
          : state.soldLog;

      const updatedBudgets =
        action.result === "SOLD" && action.soldToTeamId && action.soldPrice
          ? state.budgets.map((b) =>
              b.teamId === action.soldToTeamId
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

      const upcoming = deriveUpcoming(updatedPlayers, state.currentPot, state.currentPlayerIndex);

      return {
        ...state,
        players: updatedPlayers,
        currentPlayer: state.currentPlayer
          ? {
              ...state.currentPlayer,
              status: action.result,
              soldToTeamId: action.soldToTeamId ?? null,
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
                soldToTeamId: action.soldToTeamId ?? null,
                soldPrice: action.soldPrice ?? null,
              }
            : p
        ),
        upcomingPlayers: upcoming,
      };
    }

    case "PLAYER_SKIPPED": {
      const updatedPlayers = state.players.map((p) =>
        p.id === action.playerId ? { ...p, status: "UNSOLD" } : p
      );
      const upcoming = deriveUpcoming(updatedPlayers, state.currentPot, state.currentPlayerIndex);
      return {
        ...state,
        players: updatedPlayers,
        potPlayers: state.potPlayers.map((p) =>
          p.id === action.playerId ? { ...p, status: "UNSOLD" } : p
        ),
        upcomingPlayers: upcoming,
      };
    }

    case "SALE_UNDONE": {
      const updatedPlayers = state.players.map((p) =>
        p.id === action.playerId
          ? { ...p, status: "QUEUED", soldToTeamId: null, soldPrice: null }
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
            ? { ...p, status: "QUEUED", soldToTeamId: null, soldPrice: null }
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

function parseStatePayload(data: Record<string, unknown>): AuctionState {
  const league = data.league as Record<string, unknown>;
  const players = data.players as AuctionPlayer[];
  const potPlayers = data.potPlayers as AuctionPlayer[];
  const currentPot = league.currentPot as string | null;
  const currentPlayerIndex = league.currentPlayerIndex as number;

  return {
    connected: true,
    phase: league.phase as string,
    pots: data.pots as string[],
    currentPot,
    currentPlayerIndex,
    potPlayers,
    currentPlayer: data.currentPlayer as AuctionPlayer | null,
    currentBids: data.currentBids as BidEntry[],
    budgets: data.budgets as TeamBudgetInfo[],
    soldLog: data.soldLog as SoldEntry[],
    players,
    overseasCap: league.overseasCap as number,
    minBidIncrement: league.minBidIncrement as number,
    teams: data.teams as TeamInfo[],
    upcomingPlayers: data.upcomingPlayers as AuctionPlayer[],
  };
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
        payload: parseStatePayload(data),
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
          teamId: data.teamId ?? null,
          teamName: data.teamName ?? null,
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
        soldToTeamId: data.soldToTeamId,
        teamName: data.teamName,
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
        payload: parseStatePayload(data),
      });
    }
  }, [leagueId]);

  const myTeam = state.teams.find((t) =>
    t.memberUserIds.includes(userId)
  );
  const myTeamBudget = myTeam
    ? state.budgets.find((b) => b.teamId === myTeam.id)
    : null;

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
              teams={state.teams}
            />

            {state.upcomingPlayers.length > 0 && (
              <UpcomingPlayers players={state.upcomingPlayers} />
            )}

            {state.currentPlayer?.status === "BIDDING_OPEN" && (
              <BidPanel
                leagueId={leagueId}
                currentPlayer={state.currentPlayer}
                highestBid={highestBid}
                myTeamBudget={myTeamBudget ?? null}
                myTeamName={myTeam?.name ?? null}
                overseasCap={state.overseasCap}
                minBidIncrement={state.minBidIncrement}
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
                      <span className="font-medium">
                        {bid.teamName && (
                          <span className="text-indigo-400">{bid.teamName}</span>
                        )}
                        {bid.teamName && " · "}
                        {bid.username}
                      </span>
                      <span className="tabular-nums">
                        {(bid.amount / 10000000).toFixed(1)} Cr
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
        teams={state.teams}
      />
    </div>
  );
}
