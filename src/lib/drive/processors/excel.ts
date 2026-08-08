import { createHash } from "crypto";
import path from "path";
import { getDriveClient } from "@/lib/drive/client";
import { uploadBufferToBackblaze, getContentType } from "@/lib/backblaze";
import Catalog, { CATALOG_COLLATION } from "@/models/Catalog";
import DriveChannel from "@/models/DriveChannel";
import { makeRowReader } from "@/lib/drive/normalize";
import { parseExcelBuffer } from "@/lib/excel/parse";
import type { NormalizedRow } from "@/lib/excel/parse";
import { lookupByImageName, deleteFromImageIndex } from "@/lib/drive/imageIndex";
import { withDriveRetry } from "@/lib/drive/retry";

const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT ?? "";

type ItemStatus = "CATALOGUE" | "INSTOCK";

function parseItemStatus(raw: string): ItemStatus {
  const val = raw.trim().toUpperCase();
  if (val === "INSTOCK" || val === "IN STOCK") return "INSTOCK";
  return "CATALOGUE";
}

interface EnrichedRow extends NormalizedRow {
  itemStatusNorm: ItemStatus;
  isCatalog: boolean;
  isInstock: boolean;
  imageUrl?: string;
  storageProvider?: string;
  storagePath?: string;
}

export interface ExcelProcessResult {
  upserted: number;
  modified: number;
  skipped: number;
  errors: string[];
}

export async function processExcelFile(
  fileId: string,
  fileName: string,
): Promise<ExcelProcessResult> {
  const fnStart = Date.now();
  const errors: string[] = [];

  console.log(`[drive/excel] ▶ START ${fileName} (fileId=${fileId})`);

  const t1 = Date.now();

  const drive = getDriveClient();

  const downloadRes = await withDriveRetry(
    () => drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
    `drive/excel download ${fileName}`
  );

  const buffer = Buffer.from(downloadRes.data as ArrayBuffer);
  console.log(`[drive/excel]   → Drive download: ${Date.now() - t1}ms (${buffer.length} bytes)`);

  const t2 = Date.now();

  const parseResult = await parseExcelBuffer(buffer);

  console.log(
    `[drive/excel]   → parse: ${Date.now() - t2}ms ` +
    `(${parseResult.rowCount} rows seen, ${parseResult.rows.length} valid, ` +
    `${parseResult.errors.length} parse error(s))`
  );

  for (const e of parseResult.errors) {
    errors.push(`Row ${e.rowNumber} [${e.sku}]: ${e.reason}`);
  }

  if (parseResult.rows.length === 0) {
    console.log(`[drive/excel] ${fileName}: no valid rows — skipped`);
    return { upserted: 0, modified: 0, skipped: parseResult.rowCount, errors };
  }

  const stableJson = JSON.stringify(
    parseResult.rows.map(r => Object.fromEntries(Object.entries(r).sort()))
  );
  const contentHash = createHash("sha256").update(stableJson).digest("hex");

  const channel = await DriveChannel.findById("main").select("lastExcelContentHash").lean();

  const lastHash = (channel?.lastExcelContentHash as any)?.[fileId];

  if (lastHash === contentHash) {
    console.log(`[drive/excel] ${fileName} → Skipped ✓ (content unchanged, cells identical)`);
    return { upserted: 0, modified: 0, skipped: 0, errors: [] };
  }

  const enriched: EnrichedRow[] = parseResult.rows.map((row) => {
    const itemStatusNorm = parseItemStatus(row.itemStatus);
    return {
      ...row,
      itemStatusNorm,
      isCatalog: itemStatusNorm === "CATALOGUE",
      isInstock: itemStatusNorm === "INSTOCK",
    };
  });

  const skipped = parseResult.rowCount - enriched.length;

  const t4 = Date.now();

  const normalize = (s?: string) => {
    let val = String(s || "").trim().toUpperCase();
    if (/^(DZ|WH)[A-Z]*\d/i.test(val)) {
      val = val.replace(/^([A-Z]+)(\d+.*)$/i, "$1-$2");
    }
    return val;
  };
  const stripExt = (s: string) => s.replace(/\.[^/.]+$/, "");

  const rawTerms = [
    ...enriched.map((r) => r.designNumber),
    ...enriched.map((r) => r.imageName),
    ...enriched.map((r) => stripExt(r.imageName || "")),
  ].filter(Boolean);

  const uniqueNormalizedTerms = [...new Set(rawTerms.map((t) => normalize(t)))].filter(Boolean);
  const imageMap = new Map<string, { imageUrl: string; storageProvider?: string; storagePath?: string }>();

  if (uniqueNormalizedTerms.length > 0) {
    const existing = await Catalog.find(
      {
        $or: [
          { designNumber: { $in: uniqueNormalizedTerms } },
          { imageName: { $in: uniqueNormalizedTerms } },
        ],
        imageUrl: { $exists: true, $ne: null },
      },
      { designNumber: 1, imageName: 1, imageUrl: 1, storageProvider: 1, storagePath: 1 }
    ).collation(CATALOG_COLLATION).lean();

    for (const doc of existing) {
      if (doc.imageUrl) {
        const payload = {
          imageUrl: doc.imageUrl,
          storageProvider: doc.storageProvider,
          storagePath: doc.storagePath,
        };
        if (doc.designNumber) imageMap.set(normalize(doc.designNumber), payload);
        if (doc.imageName) {
          imageMap.set(normalize(doc.imageName), payload);
          imageMap.set(normalize(stripExt(doc.imageName)), payload);
        }
      }
    }
  }

  console.log(`[drive/excel]   → image resolve: ${Date.now() - t4}ms`);

  for (const row of enriched) {
    const keysToTry = [
      normalize(row.designNumber),
      normalize(row.imageName),
      normalize(stripExt(row.imageName || "")),
    ].filter(Boolean);

    for (const key of keysToTry) {
      const img = imageMap.get(key);
      if (img) {
        row.imageUrl = img.imageUrl;
        row.storageProvider = img.storageProvider;
        row.storagePath = img.storagePath;
        break;
      }
    }
  }

  // ── 5b. ImageIndex fallback (bounded parallel) ───────────────────────────
  // For rows still missing imageUrl after the Catalog lookup, check ImageIndex.
  // If found → download from Drive → upload to Backblaze → populate imageUrl.
  // Runs up to FALLBACK_CONCURRENCY lanes in parallel to avoid serial bottleneck,
  // but caps at 3 to stay well under B2 (500 req/s) and Drive quotas.
  const FALLBACK_CONCURRENCY = 3;
  const rowsMissingImage = enriched.filter((r) => !r.imageUrl);

  if (rowsMissingImage.length > 0) {
    const drive5b = getDriveClient();

    // Simple semaphore — no external package needed.
    let active = 0;
    const queue: Array<() => void> = [];
    const acquire = () =>
      new Promise<void>((resolve) => {
        if (active < FALLBACK_CONCURRENCY) { active++; resolve(); }
        else queue.push(() => { active++; resolve(); });
      });
    const release = () => {
      active--;
      const next = queue.shift();
      if (next) next();
    };

    const resolveRow = async (row: EnrichedRow) => {
      // Try imageName first, then bare designNumber + common extension
      const namesToTry = [
        row.imageName,
        `${row.designNumber}.jpg`,
        `${row.designNumber}.JPG`,
      ].filter(Boolean);

      for (const candidate of namesToTry) {
        const indexed = await lookupByImageName(candidate);
        if (!indexed) continue;

        try {
          console.log(`[drive/excel] ImageIndex hit: ${candidate} → fileId=${indexed.fileId}`);

          const dlRes = await withDriveRetry(
            () => drive5b.files.get({ fileId: indexed.fileId, alt: "media" }, { responseType: "arraybuffer" }),
            `drive/excel fallback ${indexed.imageName}`
          );
          const buf = Buffer.from(dlRes.data as ArrayBuffer);
          const contentType = getContentType(indexed.imageName);
          const { key: objectKey } = await uploadBufferToBackblaze(buf, indexed.imageName, contentType);
          const imageUrl = `${IMAGEKIT_URL_ENDPOINT.replace(/\/$/, "")}/${objectKey}`;

          // Update Catalog docs that share this image — collation index, no regex.
          const nameBase = path.basename(indexed.imageName, path.extname(indexed.imageName));
          await Catalog.updateMany(
            {
              $or: [
                { imageName: indexed.imageName },
                { designNumber: nameBase },
              ],
            },
            { $set: { imageUrl, storageProvider: "backblaze", storagePath: objectKey, imageName: indexed.imageName } }
          ).collation(CATALOG_COLLATION);

          await deleteFromImageIndex(indexed.fileId);

          row.imageUrl = imageUrl;
          row.storageProvider = "backblaze";
          row.storagePath = objectKey;

          console.log(`[drive/excel] ImageIndex gap resolved: ${indexed.imageName} → ${imageUrl}`);
          return; // success
        } catch (err) {
          console.error(`[drive/excel] ImageIndex fallback failed for ${candidate}:`, err);
        }
      }

      console.log(
        `[drive/excel] No image found for SKU ${row.sku} (imageName="${row.imageName}") — will retry next sync`
      );
    };

    await Promise.all(
      rowsMissingImage.map(async (row) => {
        await acquire();
        try { await resolveRow(row); }
        finally { release(); }
      })
    );
  }

  // ── 6. Build bulkWrite ops ────────────────────────────────────────────────
  const bulkOps: Parameters<typeof Catalog.bulkWrite>[0] = enriched.map((row) => ({
    updateOne: {
      filter: { sku: row.sku },
      update: {
        $set: {
          sku: row.sku,
          designNumber: row.designNumber,
          rfid: row.rfid,
          imageName: row.imageName,
          itemType: row.itemType,
          grossWeight: row.grossWeight,
          netWeight: row.netWeight,
          stoneWeight: row.stoneWeight,
          collectionLine: row.collectionLine,
          metalType: row.metalType,
          metalPurity: row.metalPurity,
          itemStatus: row.itemStatusNorm,
          isCatalog: row.isCatalog,
          isInstock: row.isInstock,
          driveFileId: fileId,
          ...(row.imageUrl && { imageUrl: row.imageUrl }),
          ...(row.storageProvider && { storageProvider: row.storageProvider }),
          ...(row.storagePath && { storagePath: row.storagePath }),
        },
      },
      upsert: true,
    },
  }));

  // ── 7. Flush to MongoDB ───────────────────────────────────────────────────
  const t7 = Date.now();
  let result: Awaited<ReturnType<typeof Catalog.bulkWrite>>;
  try {
    result = await Catalog.bulkWrite(bulkOps, { ordered: false });
  } catch (err: any) {
    if (err?.result && Array.isArray(err?.writeErrors)) {
      // Partial success — log individual write errors but don't abort
      for (const we of err.writeErrors.slice(0, 10)) {
        errors.push(`bulkWrite row ${we.index}: ${we.errmsg ?? we.code}`);
      }
      result = err.result; // still has nInserted, nModified etc.
      console.warn(`[drive/excel] bulkWrite partial failure: ${err.writeErrors.length} error(s)`);
    } else {
      throw err; // true connection error — rethrow
    }
  }

  console.log(
    `[drive/excel]   → bulkWrite: ${Date.now() - t7}ms ` +
    `(inserted=${result.upsertedCount} updated=${result.modifiedCount})`
  );

  console.log(
    `[drive/excel] ■ DONE ${fileName} — ` +
    `inserted=${result.upsertedCount} updated=${result.modifiedCount} ` +
    `skipped=${skipped} total=${Date.now() - fnStart}ms`
  );

  // Save content hash so future saves with identical cells are skipped.
  await DriveChannel.findByIdAndUpdate("main", {
    $set: { [`lastExcelContentHash.${fileId}`]: contentHash },
  });

  return {
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    skipped,
    errors,
  };
}
