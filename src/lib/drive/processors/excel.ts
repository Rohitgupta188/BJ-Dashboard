import * as XLSX from "xlsx";
import { getDriveClient } from "@/lib/drive/client";
import Catalog from "@/models/Catalog";


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
}

export interface ExcelProcessResult {
  upserted: number;
  modified: number;
  skipped:  number;
  errors:   string[];
}

function parseRow(
  raw: Record<string, unknown>
): ParsedRow | null {
  const sku = String(raw["SKU Number"] ?? "").trim();
  if (!sku) return null; // SKU is the minimum required field

  const designNumber  = String(raw["Design Number"] ?? "").trim();
  const imageNameCell = String(raw["Image Name"]    ?? "").trim();

  // Priority: explicit cell → designNumber
  const imageName = imageNameCell || designNumber;

  // Read itemStatus from the Excel column; normalise & default safely
  const itemStatus = parseItemStatus(raw["Item Status"]);

  return {
    sku,
    designNumber,
    rfid:           String(raw["RFID Tag"]        ?? "").trim(),
    imageName,
    itemType:       String(raw["Item Type"]        ?? "").trim(),
    grossWeight:    Number(raw["Gross Weight"])    || 0,
    netWeight:      Number(raw["Net Weight"])      || 0,
    stoneWeight:    Number(raw["Stone Weight"])    || 0,
    collectionLine: String(raw["Collection Line"] ?? "").trim(),
    metalType:      String(raw["Metal Type"]       ?? "").trim(),
    metalPurity:    String(raw["Metal Purity"]     ?? "").trim(),
    itemStatus,
    isCatalog: itemStatus === "CATALOGUE",
    isInstock:  itemStatus === "INSTOCK",
  };
}


export async function processExcelFile(
  fileId:   string,
  fileName: string
): Promise<ExcelProcessResult> {
  const drive  = getDriveClient();
  const errors: string[] = [];

  const downloadRes = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer = Buffer.from(downloadRes.data as ArrayBuffer);

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

  if (rawRows.length === 0) {
    console.log(`[drive/excel] ${fileName}: empty sheet — skipped`);
    return { upserted: 0, modified: 0, skipped: 0, errors: [] };
  }

  const bulkOps: Parameters<typeof Catalog.bulkWrite>[0] = [];
  let skipped = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = parseRow(rawRows[i]);
    if (!row) {
      skipped++;
      errors.push(`Row ${i + 2}: missing SKU — skipped`);
      continue;
    }
    bulkOps.push({
      updateOne: {
        filter: { sku: row.sku },
        update: { $set: row },
        upsert: true,
      },
    });
  }

  if (bulkOps.length === 0) {
    return { upserted: 0, modified: 0, skipped, errors };
  }

  const result = await Catalog.bulkWrite(bulkOps, { ordered: false });

  console.log(
    `[drive/excel] ${fileName} → ` +
    `inserted=${result.upsertedCount} updated=${result.modifiedCount} skipped=${skipped}`
  );

  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    skipped,
    errors,
  };
}
