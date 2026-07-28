import { getSheetsClient } from "@/lib/drive/client";
import Customer from "@/models/Customer";
import {
  normalizeKey,
  normalizeHeaders,
  makeRowReader,
} from "@/lib/drive/normalize";

const HEADER_MAP: Record<string, string> = {
  // New headers from "New Customer Registration Form"
  companyname:    "name",
  personname:     "contactName",
  whatsappnumber: "phone",
  companyaddress: "address",
  
  // Legacy headers just in case
  name:           "name",
  firmname:       "name",
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

  const allSheets = metaRes.data.sheets ?? [];
  
  const customerSheet = allSheets.find((s) => {
    const t = s.properties?.title?.toLowerCase() || "";
    return t.includes("new customer registration") || t === "customer registrations";
  });

  const sheetTitle = customerSheet?.properties?.title ?? allSheets[0]?.properties?.title ?? "Sheet1";

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetTitle,
  });

  const rows = dataRes.data.values ?? [];
  if (rows.length < 2) {
    console.log(`[drive/sheets] "${sheetTitle}": no data rows — skipped`);
    return { upserted: 0, skipped: 0, errors: [] };
  }

  const normalizedHeaders: string[] = normalizeHeaders(rows[0]);

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
