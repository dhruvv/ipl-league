export interface ParsedPlayer {
  slNo: number | null;
  name: string;
  basePrice: number;
  position: string | null;
  country: string;
  bowlingStyle: string | null;
  battingStyle: string | null;
  iplTeam: string | null;
  pot: string;
  soldPrice: number | null;
}

export interface ParseResult {
  players: ParsedPlayer[];
  errors: string[];
}

const HEADER_MAP: Record<string, keyof ParsedPlayer> = {
  "sl. no": "slNo",
  "sl no": "slNo",
  slno: "slNo",
  serial: "slNo",
  "#": "slNo",

  name: "name",
  player: "name",
  "player name": "name",

  "base price": "basePrice",
  baseprice: "basePrice",
  "base_price": "basePrice",
  price: "basePrice",

  pos: "position",
  position: "position",
  role: "position",

  country: "country",
  nationality: "country",

  "auction price": "soldPrice",
  auctionprice: "soldPrice",
  "sold price": "soldPrice",

  "bowling style": "bowlingStyle",
  bowlingstyle: "bowlingStyle",
  bowling: "bowlingStyle",

  "batting style": "battingStyle",
  battingstyle: "battingStyle",
  batting: "battingStyle",

  team: "iplTeam",
  "ipl team": "iplTeam",
  franchise: "iplTeam",

  pot: "pot",
  group: "pot",
  category: "pot",
  bucket: "pot",
};

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹$,\s]/g, "");
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
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

export function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) {
    return { players: [], errors: ["CSV must have a header row and at least one data row"] };
  }

  const headerFields = parseCsvLine(lines[0]);
  const columnMap: (keyof ParsedPlayer | null)[] = headerFields.map((h) => {
    const normalized = h.toLowerCase().trim();
    return HEADER_MAP[normalized] ?? null;
  });

  const hasName = columnMap.includes("name");
  const hasBasePrice = columnMap.includes("basePrice");
  const hasPot = columnMap.includes("pot");

  const missingRequired: string[] = [];
  if (!hasName) missingRequired.push("Name");
  if (!hasBasePrice) missingRequired.push("Base Price");
  if (!hasPot) missingRequired.push("Pot");

  if (missingRequired.length > 0) {
    return {
      players: [],
      errors: [`Missing required columns: ${missingRequired.join(", ")}. Found: ${headerFields.join(", ")}`],
    };
  }

  const players: ParsedPlayer[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};

    for (let j = 0; j < columnMap.length; j++) {
      const key = columnMap[j];
      if (key && fields[j] !== undefined) {
        row[key] = fields[j];
      }
    }

    if (!row.name?.trim()) {
      errors.push(`Row ${i + 1}: missing name, skipped`);
      continue;
    }

    const basePrice = parsePrice(row.basePrice || "");
    if (basePrice === null || basePrice < 0) {
      errors.push(`Row ${i + 1} (${row.name}): invalid base price "${row.basePrice}"`);
      continue;
    }

    if (!row.pot?.trim()) {
      errors.push(`Row ${i + 1} (${row.name}): missing pot`);
      continue;
    }

    const slNoRaw = row.slNo ? Number(row.slNo) : null;

    players.push({
      slNo: slNoRaw !== null && !isNaN(slNoRaw) ? slNoRaw : null,
      name: row.name.trim(),
      basePrice,
      position: row.position?.trim() || null,
      country: row.country?.trim() || "India",
      bowlingStyle: row.bowlingStyle?.trim() || null,
      battingStyle: row.battingStyle?.trim() || null,
      iplTeam: row.iplTeam?.trim() || null,
      pot: row.pot.trim().toUpperCase(),
      soldPrice: parsePrice(row.soldPrice || ""),
    });
  }

  return { players, errors };
}
