import * as XLSX from "xlsx";
import { getDriveClient }  from "@/lib/drive/client";
import Catalog             from "@/models/Catalog";
import { makeRowReader }   from "@/lib/drive/normalize";
import { objectExistsInBucket, DEFAULT_UPLOAD_FOLDER } from "@/lib/backblaze";


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
  imageUrl?:      string;
  storageProvider?: string;
  storagePath?:   string;
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

async function parseRow(
  raw: Record<string, unknown>
): Promise<ParsedRow | null> {
  const get = makeRowReader(raw);

  const sku = get("SKU Number", "SKUNumber", "sku");
  if (!sku) return null; 

  const designNumber  = get("Design Number", "DesignNumber");
  const imageNameCell = get("Image Name",    "ImageName");

  // Strictly use explicit Image Name cell
  const imageName = String(imageNameCell || "").trim();

  let imageUrl = undefined;
  let storageProvider = undefined;
  let storagePath = undefined;

  if (imageName) {
    const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/$/, "");
    const hasExt = /\.(jpg|jpeg|png|webp|gif)$/i.test(imageName);
    const finalName = hasExt ? imageName : `${imageName}.jpg`;
    
    const objectKey = `${DEFAULT_UPLOAD_FOLDER}/${finalName}`;
    
    // Check backblaze first, as requested.
    const exists = await objectExistsInBucket(objectKey);
    
    if (exists) {
      // ImageKit URLs map exactly to the Backblaze objectKey (which includes the folder)
      imageUrl = `${endpoint}/${objectKey}`;
      storageProvider = "backblaze";
      storagePath = objectKey;
    }
  }

  const itemStatus = parseItemStatus(get("Item Status", "ItemStatus", "Status"));

  const resultRow: ParsedRow = {
    sku,
    designNumber:   String(designNumber || "").trim(),
    rfid:           String(get("RFID Tag",       "RFID",          "RFIDTag") || "").trim(),
    imageName,
    itemType:       String(get("Item Type",       "ItemType") || "").trim(),
    grossWeight:    Number(get("Gross Weight",    "GrossWeight"))  || 0,
    netWeight:      Number(get("Net Weight",      "NetWeight"))    || 0,
    stoneWeight:    Number(get("Stone Weight",    "StoneWeight"))  || 0,
    collectionLine: get("Collection Line",  "CollectionLine") as string,
    metalType:      get("Metal Type",        "MetalType") as string,
    metalPurity:    get("Metal Purity",      "MetalPurity") as string,
    itemStatus,
    isCatalog: itemStatus === "CATALOGUE",
    isInstock:  itemStatus === "INSTOCK",
  };

  if (imageUrl) {
    resultRow.imageUrl = imageUrl;
    resultRow.storageProvider = storageProvider;
    resultRow.storagePath = storagePath;
  }

  return resultRow;
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
    const row = await parseRow(rawRows[i]);
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
