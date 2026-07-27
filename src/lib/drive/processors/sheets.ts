import { getSheetsClient } from "@/lib/drive/client";
import Customer from "@/models/Customer";

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, string> = {
  name:           "name",
  firmname:       "name",
  companyname:    "name",
  customername:   "name",
  shopname:       "name",
  contact:        "contactName",
  contactname:    "contactName",
  contactperson:  "contactName",
  phone:          "phone",
  mobile:         "phone",
  phoneno:        "phone",
  mobileno:       "phone",
  contactno:      "phone",
  phno:           "phone",
  email:          "email",
  emailid:        "email",
  address:        "address",
};

export async function processCustomerSheet(
  spreadsheetId: string
): Promise<{ upserted: number; skipped: number; errors: string[] }> {
  const sheets = getSheetsClient();
  const errors: string[] = [];
  let upserted = 0;
  let skipped  = 0;

  const metaRes = await sheets.spreadsheets.get({ spreadsheetId });

  const sheetTitle =
    metaRes.data.sheets?.[0]?.properties?.title ?? "Sheet1";

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetTitle,
  });

  const rows = dataRes.data.values ?? [];
  if (rows.length < 2) {
    console.log(`[drive/sheets] "${sheetTitle}": no data rows — skipped`);
    return { upserted: 0, skipped: 0, errors: [] };
  }

  const normalizedHeaders: string[] = rows[0].map((h: unknown) =>
    normalizeHeader(String(h))
  );

  for (let i = 1; i < rows.length; i++) {
    const rowValues = rows[i] as unknown[];
    const record: Record<string, string> = {};

    normalizedHeaders.forEach((header, col) => {
      const field = HEADER_MAP[header];
      if (field && rowValues[col]) {
        record[field] = String(rowValues[col]).trim();
      }
    });

    if (!record.name || !record.phone) {
      skipped++;
      continue;
    }

    try {
      await Customer.findOneAndUpdate(
        { phone: record.phone }, 
        { $set: record },
        { upsert: true }
      );
      upserted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${i + 1}: ${msg}`);
    }
  }

  console.log(
    `[drive/sheets] Customer sync → upserted=${upserted} skipped=${skipped} errors=${errors.length}`
  );
  return { upserted, skipped, errors };
}
