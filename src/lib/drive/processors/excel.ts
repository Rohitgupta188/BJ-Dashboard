import * as XLSX       from "xlsx";
import { getDriveClient }  from "@/lib/drive/client";
import Catalog             from "@/models/Catalog";
import { makeRowReader }   from "@/lib/drive/normalize";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = "CATALOGUE" | "INSTOCK";

function parseItemStatus(raw: unknown): ItemStatus {
  const val = String(raw ?? "").trim().toUpperCase();
  if (val === "INSTOCK" || val === "IN STOCK") return "INSTOCK";
  if (val === "CATALOGUE" || val === "CATALOG")  return "CATALOGUE";
  return "CATALOGUE";
}

interface ParsedRow {
  sku:            string;
  designNumber:   string;
  rfid:           string;
  imageName:      string;
  itemType:       string;
  grossWeight:    number;
  netWeight:      number;
  stoneWeight:    number;
  collectionLine: string;
  metalType:      string;
  metalPurity:    string;
  itemStatus:     ItemStatus;
  isCatalog:      boolean;
  isInstock:      boolean;
  // Image fields — populated from DB lookup, NOT from Backblaze
  imageUrl?:       string;
  storageProvider?: string;
  storagePath?:    string;
}

export interface ExcelProcessResult {
  upserted: number;
  modified: number;
  skipped:  number;
  errors:   string[];
}

// ─── Row Parser (sync — zero network calls) ────────────────────────────────

/**
 * Converts a raw spreadsheet row to a typed ParsedRow.
 * This is intentionally synchronous — no DB or HTTP calls here.
 * Image fields are resolved in a single batch lookup AFTER all rows are parsed.
 */
function parseRow(raw: Record<string, unknown>): ParsedRow | null {
  const get = makeRowReader(raw);

  const sku = get("SKU Number", "SKUNumber", "sku");
  if (!sku) return null;

  const designNumber    = String(get("Design Number", "DesignNumber") || "").trim();
  const imageName       = String(get("Image Name",    "ImageName")    || "").trim();
  const itemStatus      = parseItemStatus(get("Item Status", "ItemStatus", "Status"));

  return {
    sku,
    designNumber,
    imageName,
    rfid:           String(get("RFID Tag",        "RFID",          "RFIDTag")    || "").trim(),
    itemType:       String(get("Item Type",        "ItemType")                   || "").trim(),
    grossWeight:    Number(get("Gross Weight",     "GrossWeight"))  || 0,
    netWeight:      Number(get("Net Weight",       "NetWeight"))    || 0,
    stoneWeight:    Number(get("Stone Weight",     "StoneWeight"))  || 0,
    collectionLine: String(get("Collection Line",  "CollectionLine")             || "").trim(),
    metalType:      String(get("Metal Type",       "MetalType")                  || "").trim(),
    metalPurity:    String(get("Metal Purity",     "MetalPurity")                || "").trim(),
    itemStatus,
    isCatalog: itemStatus === "CATALOGUE",
    isInstock:  itemStatus === "INSTOCK",
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function processExcelFile(
  fileId:   string,
  fileName: string
): Promise<ExcelProcessResult> {
  const fnStart = Date.now();
  const errors: string[] = [];

  console.log(`[drive/excel] ▶ START ${fileName} (fileId=${fileId})`);

  // ── 1. Download from Google Drive ─────────────────────────────────────────
  const t1 = Date.now();
  const drive = getDriveClient();
  const downloadRes = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(downloadRes.data as ArrayBuffer);
  console.log(`[drive/excel]   → Drive download: ${Date.now() - t1}ms (${buffer.length} bytes)`);

  // ── 2. Parse workbook ─────────────────────────────────────────────────────
  const t2 = Date.now();
  const workbook  = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    console.warn(`[drive/excel] ${fileName}: workbook has no sheets — skipped`);
    return { upserted: 0, modified: 0, skipped: 0, errors: ["No sheets found in workbook"] };
  }

  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
    workbook.Sheets[sheetName],
    { defval: "" }
  );
  console.log(`[drive/excel]   → XLSX parse: ${Date.now() - t2}ms (${rawRows.length} raw rows)`);

  if (rawRows.length === 0) {
    console.log(`[drive/excel] ${fileName}: empty sheet — skipped`);
    return { upserted: 0, modified: 0, skipped: 0, errors: [] };
  }

  // ── 3. Parse rows (sync — zero network calls) ─────────────────────────────
  const t3 = Date.now();
  const parsed: Array<ParsedRow | null> = rawRows.map((raw, i) => {
    const row = parseRow(raw);
    if (!row) errors.push(`Row ${i + 2}: missing SKU — skipped`);
    return row;
  });
  const validRows = parsed.filter((r): r is ParsedRow => r !== null);
  const skipped   = rawRows.length - validRows.length;
  console.log(
    `[drive/excel]   → row parse (sync): ${Date.now() - t3}ms ` +
    `(${validRows.length} valid, ${skipped} skipped)`
  );

  if (validRows.length === 0) {
    return { upserted: 0, modified: 0, skipped, errors };
  }

  // ── 4. Single batch image lookup (one MongoDB query for the whole file) ───
  const t4 = Date.now();
  const designNumbers = validRows.map(r => r.designNumber);
  const uniqueDesignNumbers = [...new Set(designNumbers.filter(Boolean))];
  
  const imageMap = new Map<string, { imageUrl: string; storageProvider?: string; storagePath?: string }>();
  
  if (uniqueDesignNumbers.length > 0) {
    const existing = await Catalog.find(
      { designNumber: { $in: uniqueDesignNumbers }, imageUrl: { $exists: true, $ne: null } },
      { designNumber: 1, imageUrl: 1, storageProvider: 1, storagePath: 1 }
    ).lean();

    for (const doc of existing) {
      if (doc.imageUrl) {
        imageMap.set(doc.designNumber, {
          imageUrl:        doc.imageUrl,
          storageProvider: doc.storageProvider,
          storagePath:     doc.storagePath,
        });
      }
    }
  }

  console.log(`[drive/excel]   → image resolve total: ${Date.now() - t4}ms`);

  // ── 5. Merge image data into rows ─────────────────────────────────────────
  for (const row of validRows) {
    const img = imageMap.get(row.designNumber);
    if (img) {
      row.imageUrl        = img.imageUrl;
      row.storageProvider = img.storageProvider;
      row.storagePath     = img.storagePath;
    }
  }

  // ── 6. Build bulkWrite ops ────────────────────────────────────────────────
  const bulkOps: Parameters<typeof Catalog.bulkWrite>[0] = validRows.map(row => ({
    updateOne: {
      filter: { sku: row.sku },
      update: { $set: { ...row, driveFileId: fileId } },
      upsert: true,
    },
  }));

  // ── 7. Flush to MongoDB (single bulkWrite) ────────────────────────────────
  const t7 = Date.now();
  const result = await Catalog.bulkWrite(bulkOps, { ordered: false });
  console.log(
    `[drive/excel]   → bulkWrite: ${Date.now() - t7}ms ` +
    `(inserted=${result.upsertedCount} updated=${result.modifiedCount})`
  );

  const totalMs = Date.now() - fnStart;
  console.log(
    `[drive/excel] ■ DONE ${fileName} — ` +
    `inserted=${result.upsertedCount} updated=${result.modifiedCount} skipped=${skipped} ` +
    `total=${totalMs}ms`
  );

  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    skipped,
    errors,
  };
}
