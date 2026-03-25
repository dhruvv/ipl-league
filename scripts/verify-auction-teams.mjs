import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

function parseArgs(argv) {
  const args = new Set(argv);
  const getValue = (flag, defaultValue = undefined) => {
    const i = argv.indexOf(flag);
    if (i === -1) return defaultValue;
    return argv[i + 1] ?? defaultValue;
  };

  return {
    csvPath: getValue("--csv", "auction2026_players.csv"),
    leagueId: getValue("--league-id", null),
    apply: args.has("--apply"),
    unsellMissing: args.has("--unsell-missing"),
    setSoldPrice: args.has("--set-sold-price"),
    // CSV numbers look like "Cr". Convert to DB integer rupees using 1 Cr = 10,000,000 rupees.
    // Only used when --set-sold-price is enabled.
    soldPriceMultiplier: Number(getValue("--sold-price-multiplier", "10000000")),
  };
}

function normalizeKey(s) {
  return (s ?? "")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Mirrors src/lib/csv-parser.ts behavior: supports quoted fields + commas.
function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseNumberLike(raw) {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const {
    csvPath,
    leagueId: leagueIdArg,
    apply,
    unsellMissing,
    setSoldPrice,
    soldPriceMultiplier,
  } = parseArgs(process.argv.slice(2));

  const csvText = readFileSync(resolve(csvPath), "utf8");
  const lines = csvText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const headerFields = parseCsvLine(lines[0]);
  if (headerFields.length % 2 !== 0) {
    console.warn(
      `Warning: header field count is ${headerFields.length} (expected even: TeamName,Budget pairs).`
    );
  }
  const teamCount = Math.floor(headerFields.length / 2);
  if (teamCount <= 0) throw new Error("Could not determine CSV team columns.");

  const csvTeams = [];
  for (let i = 0; i < teamCount; i++) {
    const teamName = headerFields[i * 2];
    if (!teamName || !teamName.trim()) {
      throw new Error(`Empty team name in CSV header at team column index ${i}.`);
    }
    csvTeams.push({
      name: teamName.trim(),
      key: normalizeKey(teamName),
    });
  }

  // expectedByPlayerKey: playerKey -> { playerName, teamKey, soldPriceRu? }
  const expectedByPlayerKey = new Map();
  const expectedTeamRosterKeys = new Map(); // teamKey -> Set(playerKey)
  for (const t of csvTeams) expectedTeamRosterKeys.set(t.key, new Set());

  // CSV is wide:
  // - Header: TeamName,Budget pairs (Budget is ignored for verification)
  // - Each row: playerName,soldPrice pairs repeated for each team column
  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const fields = parseCsvLine(lines[rowIdx]);

    for (let tIdx = 0; tIdx < teamCount; tIdx++) {
      const playerName = fields[tIdx * 2] ?? "";
      const soldPriceRaw = fields[tIdx * 2 + 1] ?? "";
      if (!playerName.toString().trim()) continue;

      const teamKey = csvTeams[tIdx].key;
      const playerNameTrim = playerName.toString().trim();

      const playerKey = normalizeKey(playerNameTrim);
      if (expectedByPlayerKey.has(playerKey)) {
        throw new Error(`Duplicate player name after normalization in CSV: "${playerNameTrim}" (row ${rowIdx + 1}).`);
      }

      const soldPriceCr = parseNumberLike(soldPriceRaw);
      const soldPriceRupees =
        soldPriceCr == null ? null : Math.round(soldPriceCr * soldPriceMultiplier);

      expectedByPlayerKey.set(playerKey, {
        playerName: playerNameTrim,
        teamKey,
        soldPriceRupees,
      });
      expectedTeamRosterKeys.get(teamKey).add(playerKey);
    }
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL1 });
  if (!process.env.DATABASE_UR1L) throw new Error("Missing DATABASE_URL1 in environment.");

  // Helpful debug: show host/user/db, but never print the password.
  // Example DATABASE_URL1: postgresql://user:pass@host:5432/dbname
  try {
    const u = new URL(process.env.DATABASE_URL1);
    const dbName = u.pathname.replace(/^\//, "");
    console.log(
      `Connecting to Postgres ${u.hostname}:${u.port || "5432"} as ${u.username} (db: ${dbName})`
    );
  } catch {
    // Ignore URL parsing issues; pg will throw a useful error later.
  }

  await client.connect();

  try {
    let leagueId = leagueIdArg;

    // Resolve league by matching CSV team names to DB Team records.
    // This lets you run the script without passing --league-id.
    if (!leagueId) {
      const expectedTeamKeys = csvTeams.map((t) => t.key);
      const teamRows = await client.query(
        `SELECT "id", "name", "leagueId"
         FROM "Team"
         WHERE lower("name") = ANY($1)`,
        [expectedTeamKeys]
      );

      if (teamRows.rowCount === 0) {
        const expectedNames = csvTeams.map((t) => t.name).join(", ");
        throw new Error(`No matching teams found in DB for any CSV team names. Expected: ${expectedNames}`);
      }

      // Group by league, then choose league that contains all CSV teams.
      const grouped = new Map(); // leagueId -> Map(teamKey -> teamId/name)
      for (const r of teamRows.rows) {
        const tKey = normalizeKey(r.name);
        if (!grouped.has(r.leagueId)) grouped.set(r.leagueId, new Map());
        grouped.get(r.leagueId).set(tKey, r.id);
      }

      const candidates = [];
      for (const [lId, map] of grouped.entries()) {
        candidates.push({ leagueId: lId, matched: map.size });
      }

      candidates.sort((a, b) => b.matched - a.matched);
      const exact = candidates.find((c) => c.matched === teamCount);

      if (!exact) {
        console.warn("Could not find a league matching all CSV team names.");
        console.warn(
          "Top candidates:",
          candidates.slice(0, 5).map((c) => ({ leagueId: c.leagueId, matched: c.matched }))
        );
        throw new Error("League resolution failed. Pass --league-id explicitly if team names don't match 1:1 in DB.");
      }

      leagueId = exact.leagueId;
    }

    // Load DB teams for resolved league
    const dbTeamRows = await client.query(
      `SELECT "id", "name"
       FROM "Team"
       WHERE "leagueId" = $1`,
      [leagueId]
    );

    const teamByKey = new Map(); // teamKey -> {id,name}
    for (const r of dbTeamRows.rows) {
      teamByKey.set(normalizeKey(r.name), { id: r.id, name: r.name });
    }

    // Ensure every CSV team exists in DB
    for (const t of csvTeams) {
      if (!teamByKey.has(t.key)) {
        throw new Error(`CSV team not found in DB for resolved league. CSV="${t.name}".`);
      }
    }

    // Load expected players from DB by matching name in this league.
    const expectedPlayerKeys = Array.from(expectedByPlayerKey.keys());
    const playerRows = await client.query(
      `SELECT "id", "name", "status", "soldToTeamId", "soldPrice"
       FROM "Player"
       WHERE "leagueId" = $1
         AND lower("name") = ANY($2)`,
      [leagueId, expectedPlayerKeys]
    );

    const playersByKey = new Map(); // playerKey -> [rows]
    for (const r of playerRows.rows) {
      const k = normalizeKey(r.name);
      if (!playersByKey.has(k)) playersByKey.set(k, []);
      playersByKey.get(k).push(r);
    }

    let missingPlayers = 0;
    let ambiguousPlayers = 0;
    let wrongTeam = 0;
    let wrongStatus = 0;
    let wrongPrice = 0;
    const updates = []; // { id, soldToTeamId, status, soldPriceRupees? }

    for (const [playerKey, exp] of expectedByPlayerKey.entries()) {
      const rows = playersByKey.get(playerKey) ?? [];
      if (rows.length === 0) {
        missingPlayers++;
        continue;
      }
      if (rows.length !== 1) {
        ambiguousPlayers++;
        continue;
      }

      const actual = rows[0];
      const expectedTeamId = teamByKey.get(exp.teamKey).id;

      const needsTeam = actual.soldToTeamId !== expectedTeamId;
      const needsStatus = actual.status !== "SOLD";

      let needsPrice = false;
      if (setSoldPrice) {
        const expectedSoldPrice = exp.soldPriceRupees;
        if (expectedSoldPrice != null && actual.soldPrice !== expectedSoldPrice) {
          needsPrice = true;
          wrongPrice++;
        }
      }

      if (needsTeam) wrongTeam++;
      if (needsStatus) wrongStatus++;

      if (needsTeam || needsStatus || needsPrice) {
        updates.push({
          id: actual.id,
          soldToTeamId: expectedTeamId,
          status: "SOLD",
          soldPriceRupees: exp.soldPriceRupees,
          needsPrice,
        });
      }
    }

    console.log(`Resolved leagueId: ${leagueId}`);
    console.log(`CSV teams: ${csvTeams.map((t) => t.name).join(", ")}`);
    console.log(`Expected players in CSV: ${expectedByPlayerKey.size}`);
    console.log(`Found in DB (by name match): ${playerRows.rowCount} rows`);
    console.log("---- Verification results (expected vs DB) ----");
    console.log(`Missing players in DB: ${missingPlayers}`);
    console.log(`Ambiguous players (same name, multiple rows): ${ambiguousPlayers}`);
    console.log(`Players with wrong team: ${wrongTeam}`);
    console.log(`Players with wrong status (!= SOLD): ${wrongStatus}`);
    console.log(`Players with wrong price (only when --set-sold-price): ${wrongPrice}`);
    console.log(`Planned updates: ${updates.length}`);
    if (!apply) console.log("Dry-run mode. Use --apply to execute updates.");

    // Optional: also clear "SOLD" players for those teams not present in the CSV.
    const unsellOps = [];
    if (unsellMissing) {
      const teamIds = Array.from(teamByKey.values()).map((t) => t.id);
      const soldActualRows = await client.query(
        `SELECT "id", "name", "soldToTeamId", "status", "soldPrice"
         FROM "Player"
         WHERE "leagueId" = $1
           AND status = 'SOLD'
           AND "soldToTeamId" = ANY($2)`,
        [leagueId, teamIds]
      );

      for (const r of soldActualRows.rows) {
        const k = normalizeKey(r.name);
        if (!expectedByPlayerKey.has(k)) {
          unsellOps.push({ id: r.id });
        }
      }

      console.log(`Planned UNSOLD (not in CSV) updates: ${unsellOps.length}`);
      if (!apply) console.log("Dry-run mode. Add --apply to execute unsell-missing.");
    }

    if (!apply) return;

    await client.query("BEGIN");

    // Apply player updates
    for (const u of updates) {
      const sets = [];
      const params = [];
      let paramIdx = 1;

      sets.push(`"status" = $${paramIdx++}`);
      params.push(u.status);

      sets.push(`"soldToTeamId" = $${paramIdx++}`);
      params.push(u.soldToTeamId);

      if (setSoldPrice && u.needsPrice && u.soldPriceRupees != null) {
        sets.push(`"soldPrice" = $${paramIdx++}`);
        params.push(u.soldPriceRupees);
      }

      const sql = `UPDATE "Player" SET ${sets.join(", ")} WHERE "id" = $${paramIdx++}`;
      params.push(u.id);
      await client.query(sql, params);
    }

    // Apply unsell-missing
    if (unsellOps.length > 0) {
      for (const op of unsellOps) {
        await client.query(
          `UPDATE "Player"
           SET "status" = 'UNSOLD',
               "soldToTeamId" = NULL,
               "soldPrice" = NULL
           WHERE "id" = $1`,
          [op.id]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Updates committed.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

