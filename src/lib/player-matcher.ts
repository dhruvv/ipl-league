import type { CricApiSquadPlayer } from "./cricapi";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export interface MatchSuggestion {
  playerId: string;
  playerName: string;
  playerIplTeam: string | null;
  suggestions: {
    externalId: string;
    name: string;
    score: number;
  }[];
}

export function matchPlayers(
  leaguePlayers: { id: string; name: string; iplTeam: string | null }[],
  cricApiPlayers: CricApiSquadPlayer[]
): MatchSuggestion[] {
  return leaguePlayers.map((lp) => {
    const lpNorm = normalize(lp.name);
    const lpTokens = tokenize(lp.name);

    const scored = cricApiPlayers.map((cp) => {
      const cpNorm = normalize(cp.name);
      const cpTokens = tokenize(cp.name);

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

      const score = Math.max(fullSim, tokenScore);

      return { externalId: cp.id, name: cp.name, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
      playerId: lp.id,
      playerName: lp.name,
      playerIplTeam: lp.iplTeam,
      suggestions: scored.slice(0, 5),
    };
  });
}
