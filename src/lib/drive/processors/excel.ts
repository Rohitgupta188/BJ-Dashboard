import * as XLSX from "xlsx";
import { getDriveClient }  from "@/lib/drive/client";
import Catalog             from "@/models/Catalog";
import { makeRowReader }   from "@/lib/drive/normalize";


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
  const get = makeRowReader(raw);

  const sku = get("SKU Number", "SKUNumber", "sku");
  if (!sku) return null; 

  const designNumber  = get("Design Number", "DesignNumber");
  const imageNameCell = get("Image Name",    "ImageName");

  // Priority: explicit Image Name cell → fall back to Design Number
  const imageName = imageNameCell || designNumber;

  const itemStatus = parseItemStatus(get("Item Status", "ItemStatus", "Status"));

  return {
    sku,
    designNumber,
    rfid:           get("RFID Tag",       "RFID",          "RFIDTag"),
    imageName,
    itemType:       get("Item Type",       "ItemType"),
    grossWeight:    Number(get("Gross Weight",    "GrossWeight"))  || 0,
    netWeight:      Number(get("Net Weight",      "NetWeight"))    || 0,
    stoneWeight:    Number(get("Stone Weight",    "StoneWeight"))  || 0,
    collectionLine: get("Collection Line",  "CollectionLine"),
    metalType:      get("Metal Type",        "MetalType"),
    metalPurity:    get("Metal Purity",      "MetalPurity"),
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

  console.log(`[drive/excel] Processing ${fileName} (fileId=${fileId})...`);

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
        update: { $set: { ...row, driveFileId: fileId } },  // tag with source Drive file ID
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
