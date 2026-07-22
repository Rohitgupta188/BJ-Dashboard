/**
 * scripts/upload-images.ts
 *
 * Production-grade asset pipeline for: Local Images → Backblaze B2 (private) → ImageKit CDN → Next.js
 *
 * Backblaze is storage-only and private. ImageKit is configured on its side with the
 * same B2 credentials and is the only thing that ever reads from the bucket. This
 * script never builds a Backblaze URL — imageUrl is always an ImageKit URL.
 *
 * Workflow:
 *   1. Test:       npx tsx scripts/upload-images.ts --dir images/demo --limit 250
 *   2. Fix issues, re-run the same command (already-uploaded images are skipped).
 *   3. Full run:   npx tsx scripts/upload-images.ts --dir images/full
 *
 * CLI flags (all optional):
 *   --dir <path>          Local image folder. Default: images/demo
 *   --limit <n>           Only process the first n local images found (testing).
 *   --concurrency <n>     Parallel uploads. Default: 8.
 *   --folder <name>       Storage folder prefix (used in both B2 key and ImageKit path). Default: "catalog".
 *
 * Idempotency (two layers):
 *   1. Mongo query only pulls products missing imageUrl — already-done items
 *      never even get fetched, let alone touched.
 *   2. Before uploading, we HEAD-check the object key in the bucket. If a
 *      previous run uploaded the file but crashed before saving to Mongo,
 *      this catches it and just backfills the DB record instead of
 *      re-uploading the same bytes.
 *
 * Reusable core: `uploadProductImage()` is exported separately from the CLI
 * runner so the planned "Import Product" feature can call it directly,
 * per-product, without going through this batch script.
 */

import fs from "fs";
import path from "path";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { uploadToBackblaze, objectExistsInBucket, DEFAULT_UPLOAD_FOLDER } from "@/lib/backblaze";

const KNOWN_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Fields every catalog document must already have, independent of image upload.
// These come from your import/catalog-creation flow, not from this script.
const REQUIRED_BASE_FIELDS = ["sku", "designNumber", "imageName", "itemStatus", "storageProvider"];

const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT;
if (!IMAGEKIT_URL_ENDPOINT) {
  throw new Error("Missing IMAGEKIT_URL_ENDPOINT in .env.local — required to build public image URLs.");
}

/**
 * Pre-flight check: aborts the entire run if any catalog document is missing
 * a field this script depends on. A migration script can skip-and-log; a
 * production script refuses to start if the data it's about to write into
 * isn't structurally sound in the first place.
 */
async function validateDatabaseSchema(): Promise<void> {
  const totalProducts = await Catalog.countDocuments({});
  const fieldIssues: { field: string; missing: number }[] = [];

  for (const field of REQUIRED_BASE_FIELDS) {
    const missing = await Catalog.countDocuments({
      $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }],
    });
    if (missing > 0) {
      fieldIssues.push({ field, missing });
    }
  }

  if (fieldIssues.length > 0) {
    console.error(`\n❌ Database validation failed.\n`);
    console.error(`${totalProducts} products found.`);
    for (const issue of fieldIssues) {
      console.error(`${issue.missing} products missing ${issue.field}.`);
    }
    console.error(`\nRun your catalog import script first to backfill these fields.`);
    console.error(`Aborting upload. No images were touched.\n`);
    process.exit(1);
  }

  console.log(`✓ Database schema validated (${totalProducts} products checked)`);
}

interface ProductValidationResult {
  valid: boolean;
  missingFields: string[];
}

/**
 * Per-document defense in depth. Even after the global check above passes,
 * this catches anything that slipped through — e.g. a record edited mid-run,
 * or a field that's present but empty in a way the global $exists check missed.
 */
function validateProductForUpload(product: Record<string, any>): ProductValidationResult {
  const missingFields = REQUIRED_BASE_FIELDS.filter((field) => !product[field]);
  return { valid: missingFields.length === 0, missingFields };
}

// ─── CLI args ──────────────────────────────────────────────────────────────
interface CliOptions {
  dir: string;
  limit?: number;
  concurrency: number;
  folder: string;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    dir: path.join(process.cwd(), "images", "catalog"),
    concurrency: 8,
    folder: DEFAULT_UPLOAD_FOLDER,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir":
        opts.dir = path.isAbsolute(args[++i]) ? args[i] : path.join(process.cwd(), args[i]);
        break;
      case "--limit":
        opts.limit = parseInt(args[++i], 10);
        break;
      case "--concurrency":
        opts.concurrency = parseInt(args[++i], 10);
        break;
      case "--folder":
        opts.folder = args[++i];
        break;
    }
  }
  return opts;
}

// ─── Local file indexing (single readdir, not per-product existsSync calls) ──
function buildLocalFileIndex(dir: string): Map<string, string> {
  const entries = fs.readdirSync(dir);
  const index = new Map<string, string>(); // key: filename (lower, with/without ext) -> full path

  for (const entry of entries) {
    const ext = path.extname(entry).toLowerCase();
    if (!KNOWN_EXTENSIONS.includes(ext)) continue;
    const nameWithoutExt = path.basename(entry, ext).toLowerCase();
    index.set(nameWithoutExt, path.join(dir, entry));
    index.set(entry.toLowerCase(), path.join(dir, entry)); // also allow exact match w/ extension
  }
  return index;
}

function findLocalFile(index: Map<string, string>, imageName: string): string | null {
  const lower = imageName.toLowerCase();
  if (index.has(lower)) return index.get(lower)!;

  const withoutExt = path.basename(lower, path.extname(lower));
  if (index.has(withoutExt)) return index.get(withoutExt)!;

  return null;
}

// ─── Bounded concurrency runner ────────────────────────────────────────────
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor++];
      await worker(current);
    }
  });
  await Promise.all(lanes);
}

// ─── Core reusable single-item upload (also usable by future Import Product flow) ──
export interface ProductImageResult {
  designNumber: string;
  status: "uploaded" | "backfilled" | "failed";
  url?: string;
  error?: string;
}

export async function uploadProductImage(
  product: { designNumber: string; imageName: string; save: () => Promise<unknown> } & Record<string, any>,
  localFilePath: string,
  folder: string = DEFAULT_UPLOAD_FOLDER
): Promise<ProductImageResult> {
  const fileName = path.basename(localFilePath);
  const objectKey = `${folder}/${fileName}`;

  try {
    // Safety net: object may already exist in the bucket from a prior crashed run.
    const alreadyInBucket = await objectExistsInBucket(objectKey);

    if (!alreadyInBucket) {
      await uploadToBackblaze(localFilePath, fileName, folder);
    }

    // imageUrl is ALWAYS an ImageKit URL — the bucket is private and never
    // served directly, so there is no Backblaze URL to fall back to.
    const imageUrl = `${(IMAGEKIT_URL_ENDPOINT as string).replace(/\/$/, "")}/${objectKey}`;

    product.storageProvider = "backblaze";
    product.storagePath = objectKey;
    product.imageUrl = imageUrl;
    await product.save();

    return {
      designNumber: product.designNumber,
      status: alreadyInBucket ? "backfilled" : "uploaded",
      url: imageUrl,
    };
  } catch (err) {
    return {
      designNumber: product.designNumber,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Main CLI runner ───────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

async function main() {
  const startTime = Date.now();
  const opts = parseArgs();

  await connectToDatabase();
  console.log("✓ Connected to MongoDB");

  await validateDatabaseSchema();

  if (!fs.existsSync(opts.dir)) {
    throw new Error(`Local image directory not found: ${opts.dir}`);
  }

  const localIndex = buildLocalFileIndex(opts.dir);
  let localFilePaths = Array.from(new Set(Array.from(localIndex.values())));

  if (opts.limit && opts.limit > 0) {
    localFilePaths = localFilePaths.slice(0, opts.limit);
  }

  console.log(`✓ Found ${localFilePaths.length} local images${opts.limit ? ` (limited to ${opts.limit})` : ""}`);

  // Only fetch products that still need an image — keeps re-runs cheap,
  // and means a 12K-row collection doesn't get fully re-scanned every time.
  const productsNeedingImages = await Catalog.find({
    imageName: { $exists: true, $ne: null },
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }],
  });

  const localFilesInScope = new Set(localFilePaths);

  // Match each in-scope local file to its product (if any).
  const matchedPairs: { product: (typeof productsNeedingImages)[number]; localFilePath: string }[] = [];
  const seenProductIds = new Set<string>();
  const validationFailures: { designNumber: string; missingFields: string[] }[] = [];

  for (const product of productsNeedingImages) {
    const localFilePath = findLocalFile(localIndex, product.imageName);
    if (!localFilePath) continue;
    if (!localFilesInScope.has(localFilePath)) continue;
    if (seenProductIds.has(String(product._id))) continue;

    seenProductIds.add(String(product._id));

    const validation = validateProductForUpload(product as any);
    if (!validation.valid) {
      validationFailures.push({
        designNumber: product.designNumber || product.imageName,
        missingFields: validation.missingFields,
      });
      continue; // never upload a file we can't correctly link back to MongoDB
    }

    matchedPairs.push({ product, localFilePath });
  }

  if (validationFailures.length > 0) {
    console.log(`\n❌ Validation failed for ${validationFailures.length} product(s):\n`);
    for (const failure of validationFailures) {
      console.log(`Product: ${failure.designNumber}`);
      console.log(`Missing fields:`);
      failure.missingFields.forEach((f) => console.log(`  - ${f}`));
      console.log(`Skipping upload.\n`);
    }
  }

  let uploaded = 0;
  let backfilled = 0;
  const missing: string[] = []; // anything that needs human attention

  await runWithConcurrency(matchedPairs, opts.concurrency, async ({ product, localFilePath }) => {
    const result = await uploadProductImage(product as any, localFilePath, opts.folder);

    if (result.status === "uploaded") {
      uploaded++;
      console.log(`  ✓ ${result.designNumber} → uploaded`);
    } else if (result.status === "backfilled") {
      backfilled++;
      console.log(`  ↺ ${result.designNumber} → already in bucket, DB backfilled`);
    } else {
      missing.push(`${path.basename(localFilePath)} (${result.error})`);
      console.log(`  ✗ ${result.designNumber} → FAILED: ${result.error}`);
    }
  });

  // Local files in scope that never matched any product needing an image.
  const matchedPaths = new Set(matchedPairs.map((m) => m.localFilePath));
  for (const localFilePath of localFilePaths) {
    if (matchedPaths.has(localFilePath)) continue;
    const fileName = path.basename(localFilePath);

    // Could mean: (a) no product has this imageName at all, or
    // (b) the product already has an imageUrl (genuinely fine, not an issue).
    const alreadyDone = await Catalog.exists({
      imageName: { $regex: `^${fileName.replace(/\./g, "\\.")}$`, $options: "i" },
      imageUrl: { $exists: true, $ne: null },
    });
    if (!alreadyDone) {
      missing.push(`${fileName} (no matching product found in MongoDB)`);
    }
  }

  console.log(
    `✓ Uploaded ${uploaded} images${backfilled ? ` (+${backfilled} backfilled from existing bucket objects)` : ""}`
  );

  if (validationFailures.length > 0) {
    console.log(`⚠ ${validationFailures.length} product(s) skipped due to validation failures (see above).`);
  }

  if (missing.length > 0) {
    console.log(`\n⚠ Missing:`);
    missing.forEach((f) => console.log(f));
  }

  console.log(`\n✓ Finished in ${formatDuration(Date.now() - startTime)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error in upload-images script:", err);
  process.exit(1);
});