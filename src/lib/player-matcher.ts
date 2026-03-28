import type { CricApiSquad, CricApiSquadPlayer } from "./cricapi";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(name: string): string[] {
  return normalize(name).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Known IPL-style abbreviations -> substrings to find in franchise full name (normalized, no spaces). */
const FRANCHISE_HINTS: Record<string, string[]> = {
  mi: ["mumbaiindians", "mumbai"],
  csk: ["chennai", "superkings", "chennaisuperkings"],
  kkr: ["kolkata", "knightriders", "kolkataknightriders"],
  rcb: ["royal", "challengers", "bangalore", "royalchallengers"],
  srh: ["sunrisers", "hyderabad", "sunrisershyderabad"],
  dc: ["delhi", "capitals", "delhicapitals"],
  rr: ["rajasthan", "royals", "rajasthanroyals"],
  lsg: ["lucknow", "supergiants", "lucknowsupergiants"],
  gt: ["gujarat", "titans", "gujarattitans"],
  pbks: ["punjab", "kings", "punjabkings"],
};

export interface SquadPlayerWithTeam {
  player: CricApiSquadPlayer;
  teamName: string;
  teamShort: string;
}

export function buildSquadPlayerListFromSquads(squads: CricApiSquad[]): SquadPlayerWithTeam[] {
  const out: SquadPlayerWithTeam[] = [];
  for (const s of squads) {
    for (const p of s.players) {
      out.push({
        player: p,
        teamName: s.teamName,
        teamShort: s.shortname,
      });
    }
  }
  return out;
}

function franchiseMatches(
  iplTeam: string | null | undefined,
  teamName: string,
  teamShort: string
): boolean {
  if (!iplTeam?.trim()) return false;

  const ipl = normalizeTeamToken(iplTeam);
  const tn = normalizeTeamToken(teamName);
  const ts = normalizeTeamToken(teamShort);

  if (ipl.length < 2) return false;

  if (ipl === ts || ts === ipl) return true;
  if (ipl.length >= 3 && (tn.includes(ipl) || ipl.includes(tn))) return true;
  if (ipl.length >= 2 && ts.length >= 2 && (tn.includes(ts) || ts.includes(ipl) || ipl.includes(ts)))
    return true;

  const hints = FRANCHISE_HINTS[ipl];
  if (hints) {
    for (const h of hints) {
      if (tn.includes(h) || h.includes(tn)) return true;
    }
  }

  for (const [abbrev, hintList] of Object.entries(FRANCHISE_HINTS)) {
    if (ipl.includes(abbrev) || abbrev.includes(ipl)) {
      for (const h of hintList) {
        if (tn.includes(h)) return true;
      }
    }
  }

  const fullSimShort = similarity(ipl, ts);
  const fullSimLong = similarity(ipl, tn.slice(0, Math.min(ipl.length + 8, tn.length)));
  if (fullSimShort >= 0.75 || (tn.length > 0 && fullSimLong >= 0.72)) return true;

  return false;
}

export interface ScoredSuggestion {
  externalId: string;
  name: string;
  score: number;
  franchiseAligned: boolean;
}

export interface MatchSuggestionRow {
  playerId: string;
  playerName: string;
  playerIplTeam: string | null;
  suggestions: ScoredSuggestion[];
  autoMapEligible: boolean;
}

export interface LeaguePlayerForMatch {
  id: string;
  name: string;
  iplTeam: string | null;
  position?: string | null;
}

function nameScore(leagueName: string, apiName: string): number {
  const lpNorm = normalize(leagueName);
  const cpNorm = normalize(apiName);
  const lpTokens = tokenize(leagueName);
  const cpTokens = tokenize(apiName);

  const fullSim = similarity(lpNorm, cpNorm);

  let tokenScore = 0;
  if (lpTokens.length > 0 && cpTokens.length > 0) {
    const lastLP = lpTokens[lpTokens.length - 1];
    const lastCP = cpTokens[cpTokens.length - 1];
    const lastNameSim = similarity(lastLP, lastCP);

    let firstScore = 0;
    if (lpTokens.length > 1 && cpTokens.length > 1) {
      firstScore = similarity(lpTokens[0], cpTokens[0]);
    } else if (
      lpTokens[0].length === 1 &&
      cpTokens[0].startsWith(lpTokens[0])
    ) {
      firstScore = 0.8;
    }

    tokenScore = lastNameSim * 0.7 + firstScore * 0.3;
  }

  return Math.max(fullSim, tokenScore);
}

function computeAutoMapEligible(top?: ScoredSuggestion, second?: ScoredSuggestion): boolean {
  if (!top) return false;
  const margin = top.score - (second?.score ?? 0);

  if (top.score >= 0.92 && margin >= 0.03) return true;
  if (top.franchiseAligned && top.score >= 0.72 && margin >= 0.06) return true;
  if (!top.franchiseAligned && top.score >= 0.88 && margin >= 0.08) return true;
  if (top.score >= 0.78 && margin >= 0.12) return true;

  return false;
}

export function matchPlayers(
  leaguePlayers: LeaguePlayerForMatch[],
  squadPlayers: SquadPlayerWithTeam[]
): MatchSuggestionRow[] {
  return leaguePlayers.map((lp) => {
    const scored: ScoredSuggestion[] = squadPlayers.map((sp) => {
      const base = nameScore(lp.name, sp.player.name);
      const aligned = franchiseMatches(lp.iplTeam, sp.teamName, sp.teamShort);
      const score = Math.min(1, base + (aligned ? 0.14 : 0));

      return {
        externalId: sp.player.id,
        name: `${sp.player.name} (${sp.teamShort || sp.teamName})`,
        score,
        franchiseAligned: aligned,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const top5 = scored.slice(0, 5);
    const eligible = computeAutoMapEligible(top5[0], top5[1]);

    return {
      playerId: lp.id,
      playerName: lp.name,
      playerIplTeam: lp.iplTeam,
      suggestions: top5,
      autoMapEligible: eligible,
    };
  });
}
