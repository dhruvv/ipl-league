/**
 * Converts various Google Sheets URL formats into a direct CSV export URL.
 *
 * Supported inputs:
 *   - https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
 *   - https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
 *   - https://docs.google.com/spreadsheets/d/{ID}/pub?output=csv
 *   - https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
 *   - https://docs.google.com/spreadsheets/d/e/{PUBLISH_ID}/pub?output=csv
 */
export function toSheetCsvUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());

    if (!url.hostname.endsWith("google.com")) return null;

    // Already a CSV export URL
    if (url.pathname.includes("/export") && url.searchParams.get("format") === "csv") {
      return input.trim();
    }

    // Published CSV URL (/pub?output=csv)
    if (url.pathname.includes("/pub") && url.searchParams.get("output") === "csv") {
      return input.trim();
    }

    // Extract sheet ID from /spreadsheets/d/{ID}/...
    const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return null;

    const sheetId = match[1];

    // Try to extract gid from hash or params
    const gid =
      url.searchParams.get("gid") ??
      url.hash.match(/gid=(\d+)/)?.[1] ??
      "0";

    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  } catch {
    return null;
  }
}

export async function fetchSheetCsv(url: string): Promise<string> {
  const csvUrl = toSheetCsvUrl(url);
  if (!csvUrl) {
    throw new Error("Invalid Google Sheets URL");
  }

  const res = await fetch(csvUrl, { redirect: "follow" });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Google Sheet (${res.status}). Make sure the sheet is published or shared publicly.`
    );
  }

  return res.text();
}
