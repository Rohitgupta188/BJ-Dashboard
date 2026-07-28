/**
 * Diagnostic: print the first row (headers) and first 3 data rows from the Google Sheet.
 * Run: npx tsx --env-file=.env.local scripts/inspect-sheet.ts
 */
import { getSheetsClient } from "../src/lib/drive/client";

async function main() {
  const SHEET_ID = process.env.GOOGLE_SHEET_ID!;

  const sheets = getSheetsClient();

  const metaRes = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allSheets = metaRes.data.sheets ?? [];
  const tabsToInspect = [
    "New Customer Registration Form",
    "Customer Registrations"
  ];

  for (const title of tabsToInspect) {
    if (!allSheets.find(s => s.properties?.title === title)) continue;

    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: title,
    });

    const rows = dataRes.data.values ?? [];
    console.log(`\n===========================================`);
    console.log(`Sheet title: "${title}"\nTotal rows: ${rows.length}`);
    if (rows.length > 0) {
      console.log("=== HEADERS (raw) ===");
      console.log(rows[0]);
      console.log("=== FIRST DATA ROW ===");
      console.log(rows[1]);
    }
    console.log(`===========================================\n`);
  }
}

main().catch(console.error);
