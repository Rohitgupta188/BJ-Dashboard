/**
 * lib/drive/processors/sheets.ts
 *
 * Google Sheets customer registration sync.
 *
 * Responsibility boundary:
 *   ✅  Fetch spreadsheet data via Sheets API
 *   ✅  Find the correct customer registration tab by title
 *   ✅  Content-hash guard — skip if tab data is identical to last sync
 *   ✅  Parse and validate rows (name + phone required)
 *   ✅  Single bulkWrite to Customer collection (not one round-trip per row)
 *
 *   ❌  Does NOT know about Drive webhooks or page tokens
 *   ❌  Does NOT manage DriveChannel lock — that's processChanges.ts
 */

import { createHash } from "crypto";
import { getSheetsClient } from "@/lib/drive/client";
import Customer from "@/models/Customer";
import DriveChannel from "@/models/DriveChannel";
import { normalizeHeaders } from "@/lib/drive/normalize";
import { withDriveRetry } from "@/lib/drive/retry";

// ─── Header normalisation map ──────────────────────────────────────────────────
// Keys are normalised (lowercase, non-alphanumeric stripped) column headers.
// Values are the canonical Customer field names.

const HEADER_MAP: Record<string, string> = {
  // Current "New Customer Registration Form" headers
  companyname:    "name",
  personname:     "contactName",
  whatsappnumber: "phone",
  companyaddress: "address",

  // Legacy headers (various past sheet formats)
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

// ─── Types ────────────────────────────────────────────────────────────────────

/** Validated, ready-to-upsert customer record. */
interface CustomerRecord {
  name:         string;
  phone:        string;
  contactName?: string;
  email?:       string;
  address?:     string;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function processCustomerSheet(
  spreadsheetId: string
): Promise<{ upserted: number; skipped: number; errors: string[] }> {
  const sheets = getSheetsClient();
  const errors: string[] = [];

  // ── 1. Find the customer registration tab ─────────────────────────────────
  const metaRes = await withDriveRetry(
    () => sheets.spreadsheets.get({ spreadsheetId }),
    `sheets.get ${spreadsheetId}`
  );
  const allSheets = metaRes.data.sheets ?? [];

  const customerSheet = allSheets.find((s) => {
    const title = s.properties?.title?.toLowerCase() ?? "";
    return (
      title.includes("new customer registration") ||
      title === "customer registrations"
    );
  });

  if (!customerSheet) {
    const tabNames = allSheets.map((s) => s.properties?.title ?? "").join(", ");
    console.warn(
      `[drive/sheets] No customer registration tab found in spreadsheet. ` +
      `Available tabs: ${tabNames} — skipping.`
    );
    return { upserted: 0, skipped: 0, errors: [] };
  }

  const sheetTitle = customerSheet.properties!.title!;

  // ── 2. Fetch raw row data ──────────────────────────────────────────────────
  const dataRes = await withDriveRetry(
    () => sheets.spreadsheets.values.get({ spreadsheetId, range: sheetTitle }),
    `sheets.values.get ${spreadsheetId}`
  );

  const rows = dataRes.data.values ?? [];
  if (rows.length < 2) {
    console.log(`[drive/sheets] "${sheetTitle}": no data rows — skipped`);
    return { upserted: 0, skipped: 0, errors: [] };
  }

  // ── 3. Content hash guard ──────────────────────────────────────────────────
  // Hash the raw Sheets row data for this tab only.
  // If another tab changed but this one is identical → skip the full sync.
  // .lean() returns Maps as plain objects — use bracket notation, not .get().
  const contentHash = createHash("sha256")
    .update(JSON.stringify(rows))
    .digest("hex");

  const channel = await DriveChannel.findById("main")
    .select("lastSheetHash")
    .lean();
  const lastHash = (channel?.lastSheetHash as Record<string, string> | undefined)?.[spreadsheetId];

  if (lastHash === contentHash) {
    console.log(
      `[drive/sheets] "${sheetTitle}" → Skipped ✓ (content unchanged, another tab edited)`
    );
    return { upserted: 0, skipped: 0, errors: [] };
  }

  // ── 4. Parse rows into validated CustomerRecord[] ─────────────────────────
  // Collect ALL valid records first — then flush in a single bulkWrite.
  // The original pattern (one findOneAndUpdate per row) made N serial Mongo
  // round-trips; bulkWrite sends them as one batched operation.
  const normalizedHeaders: string[] = normalizeHeaders(rows[0]);
  const validRecords: CustomerRecord[] = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const rowValues = rows[i] as unknown[];
    const raw: Record<string, string> = {};

    normalizedHeaders.forEach((header, col) => {
      const field = HEADER_MAP[header];
      const cellValue = rowValues[col];
      // Only map recognised headers that have a non-empty cell value.
      if (field && cellValue !== null && cellValue !== undefined && String(cellValue).trim() !== "") {
        raw[field] = String(cellValue).trim();
      }
    });

    // name and phone are mandatory — skip rows missing either.
    if (!raw.name || !raw.phone) {
      skipped++;
      continue;
    }

    // Sanitize phone: strip all non-digit characters for consistent dedup.
    // Preserves leading + for international numbers (e.g. +91...).
    const sanitizedPhone = raw.phone.replace(/[^\d+]/g, "");
    if (!sanitizedPhone) {
      skipped++;
      continue;
    }

    validRecords.push({
      name:        raw.name,
      phone:       sanitizedPhone,
      ...(raw.contactName && { contactName: raw.contactName }),
      ...(raw.email       && { email:       raw.email }),
      ...(raw.address     && { address:     raw.address }),
    });
  }

  // ── 5. Single bulkWrite for all valid records ──────────────────────────────
  // upsert by phone: if a customer's phone already exists, update fields.
  // ordered: false — continue on individual write errors (e.g. duplicate key
  // on a race) so one bad row doesn't abort the rest.
  let upserted = 0;

  if (validRecords.length > 0) {
    const bulkOps = validRecords.map((record) => ({
      updateOne: {
        filter: { phone: record.phone },
        update: { $set: record },
        upsert: true,
      },
    }));

    try {
      const result = await Customer.bulkWrite(bulkOps, { ordered: false });
      // upsertedCount = new docs inserted; modifiedCount = existing docs updated.
      upserted = result.upsertedCount + result.modifiedCount;
    } catch (err: any) {
      // BulkWriteError with partial success (ordered: false) — salvage result.
      if (err?.result && Array.isArray(err?.writeErrors)) {
        upserted = (err.result.nUpserted ?? 0) + (err.result.nModified ?? 0);
        for (const we of (err.writeErrors as Array<{ index: number; errmsg?: string; code?: number }>).slice(0, 10)) {
          errors.push(`Row ${we.index + 2}: ${we.errmsg ?? `code ${we.code}`}`);
        }
        console.warn(
          `[drive/sheets] bulkWrite partial failure: ${err.writeErrors.length} error(s)`
        );
      } else {
        // True connection / schema error — rethrow so processChanges logs it.
        throw err;
      }
    }
  }

  console.log(
    `[drive/sheets] "${sheetTitle}" → ` +
    `upserted=${upserted} skipped=${skipped} errors=${errors.length} ` +
    `(from ${validRecords.length} valid / ${rows.length - 1} total rows)`
  );

  // ── 6. Persist content hash for future dedup ──────────────────────────────
  await DriveChannel.findByIdAndUpdate("main", {
    $set: { [`lastSheetHash.${spreadsheetId}`]: contentHash },
  });

  return { upserted, skipped, errors };
}
