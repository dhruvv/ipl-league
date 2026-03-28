const BASE_URL = "https://api.cricapi.com/v1";

function getApiKey(): string {
  const key = process.env.CRICAPI_KEY;
  if (!key) throw new Error("CRICAPI_KEY environment variable is not set");
  return key;
}

export interface CricApiMatch {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo: { name: string; shortname: string; img: string }[];
  score: { r: number; w: number; o: number; inning: string }[];
  series_id: string;
  fantasyEnabled: boolean;
  bbbEnabled: boolean;
  hasSquad: boolean;
  matchStarted: boolean;
  matchEnded: boolean;
}

export interface CricApiScorecard {
  id: string;
  name: string;
  matchType: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo: { name: string; shortname: string; img: string }[];
  score: { r: number; w: number; o: number; inning: string }[];
  tossWinner: string;
  tossChoice: string;
  matchWinner: string;
  series_id: string;
  scorecard: ScorecardInnings[];
}

export interface ScorecardInnings {
  inning: string;
  batting: ScorecardBatting[];
  bowling: ScorecardBowling[];
  catching: ScorecardCatching[];
}

export interface ScorecardBatting {
  batsman: { id: string; name: string };
  dismissal: string;
  r: number;
  b: number;
  "4s": number;
  "6s": number;
  sr: number;
}

export interface ScorecardBowling {
  bowler: { id: string; name: string };
  o: number;
  m: number;
  r: number;
  w: number;
  nb: number;
  wd: number;
  eco: number;
  "0s": number;
}

export interface ScorecardCatching {
  catcher: { id: string; name: string };
  stumpinh?: number;
  catch?: number;
  runout?: number;
  lbw?: number;
}

export interface CricApiSquadPlayer {
  id: string;
  name: string;
  country: string;
}

export interface CricApiSquad {
  teamName: string;
  shortname: string;
  players: CricApiSquadPlayer[];
}

export interface CricApiSeries {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  odi: number;
  t20: number;
  test: number;
  squads: number;
  matches: number;
}

export interface CricApiSeriesInfo {
  info: CricApiSeries;
  matchList: {
    id: string;
    name: string;
    matchType: string;
    status: string;
    venue: string;
    date: string;
    dateTimeGMT: string;
    teams: string[];
    fantasyEnabled: boolean;
    bbbEnabled: boolean;
    hasSquad: boolean;
    matchStarted: boolean;
    matchEnded: boolean;
  }[];
}

async function cricFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const apikey = getApiKey();
  const searchParams = new URLSearchParams({ apikey, ...params });
  const url = `${BASE_URL}/${endpoint}?${searchParams}`;

  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`CricAPI ${endpoint} failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.status !== "success") {
    throw new Error(`CricAPI ${endpoint} error: ${json.status} - ${JSON.stringify(json.reason ?? json.message ?? "")}`);
  }

  return json.data as T;
}

export async function fetchCurrentMatches(offset = 0): Promise<CricApiMatch[]> {
  return cricFetch<CricApiMatch[]>("currentMatches", { offset: String(offset) });
}

export async function fetchMatchScorecard(matchId: string): Promise<CricApiScorecard> {
  return cricFetch<CricApiScorecard>("match_scorecard", { id: matchId });
}

export async function fetchMatchSquad(matchId: string): Promise<CricApiSquad[]> {
  return cricFetch<CricApiSquad[]>("match_squad", { id: matchId });
}

export async function fetchSeries(offset = 0): Promise<CricApiSeries[]> {
  return cricFetch<CricApiSeries[]>("series", { offset: String(offset) });
}

export async function fetchSeriesInfo(seriesId: string): Promise<CricApiSeriesInfo> {
  return cricFetch<CricApiSeriesInfo>("series_info", { id: seriesId });
}

export type MatchPointsResponse = {
  innings: {
    inning: string;
    batting: { name: string; id: string; points: number }[];
    bowling: { name: string; id: string; points: number }[];
    catching: { name: string; id: string; points: number }[];
  }[];
};

/**
 * Pre-calculated fantasy points from cricketdata.org (paid plan).
 * Optional `rules`: ruleset id from your cricketdata member area (parameter name per their API).
 */
export async function fetchMatchPoints(
  matchId: string,
  options?: { rulesetId?: string | null }
): Promise<MatchPointsResponse> {
  const params: Record<string, string> = { id: matchId };
  const ruleset =
    options?.rulesetId?.trim() ||
    process.env.CRICAPI_FANTASY_RULESET_ID?.trim();
  if (ruleset) {
    params.rules = ruleset;
  }
  return cricFetch<MatchPointsResponse>("match_points", params);
}
