/**
 * scripts/backfill-images-by-design.ts
 *
 * Some SKUs share a designNumber with an already-uploaded SKU but have no
 * imageUrl themselves (e.g. same design, different weight or purity).
 *
 * This script:
 *   1. Finds all SKUs missing imageUrl.
 *   2. For each, checks if another SKU with the same designNumber already
 *      has an imageUrl.
 *   3. If yes — copies imageUrl, storagePath, storageProvider across.
 *   4. Logs a summary and writes a JSON log to logs/.
 *
 * Run with: npx tsx scripts/backfill-images-by-design.ts
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";

function writeLogFile(content: object): string {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const fileName = `backfill-images-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(logsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

async function main() {
  await connectToDatabase();
  console.log("✓ Connected to MongoDB\n");

  // ── Step 1: find all SKUs missing imageUrl ─────────────────────────────────

  const missingDocs = await Catalog.find({
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }],
  })
    .select("_id sku designNumber")
    .lean();

  console.log(`SKUs missing imageUrl: ${missingDocs.length}`);

  if (missingDocs.length === 0) {
    console.log("✓ Nothing to backfill.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── Step 2: build a designNumber → imageUrl map from docs that HAVE one ───

  // Get unique designNumbers from missing docs
  const designNumbers = [...new Set(missingDocs.map((d) => d.designNumber))];

  // For each designNumber, find one sibling SKU that already has an imageUrl
  const donors = await Catalog.find({
    designNumber: { $in: designNumbers },
    imageUrl: { $exists: true, $ne: null },
  })
    .select("designNumber imageUrl storagePath storageProvider")
    .lean();

  // Map: designNumber → donor fields
  const donorMap = new Map<
    string,
    { imageUrl: string; storagePath?: string; storageProvider?: string }
  >();

  for (const donor of donors) {
    if (!donorMap.has(donor.designNumber)) {
      donorMap.set(donor.designNumber, {
        imageUrl:        donor.imageUrl!,
        storagePath:     donor.storagePath,
        storageProvider: donor.storageProvider,
      });
    }
  }

  console.log(`Design numbers with a donor imageUrl: ${donorMap.size}`);

  // ── Step 3: split into backfillable vs truly missing ──────────────────────

  const toBackfill   = missingDocs.filter((d) => donorMap.has(d.designNumber));
  const trulyMissing = missingDocs.filter((d) => !donorMap.has(d.designNumber));

  console.log(`Can backfill:    ${toBackfill.length}`);
  console.log(`No donor found:  ${trulyMissing.length}\n`);

  if (toBackfill.length === 0) {
    console.log("⚠ No SKUs could be backfilled — no sibling with an imageUrl found.");
  }

  // ── Step 4: bulk update ───────────────────────────────────────────────────

  let backfilled = 0;
  let failed     = 0;
  const errors: { sku: string; error: string }[] = [];

  if (toBackfill.length > 0) {
    const operations = toBackfill.map((doc) => {
      const donor = donorMap.get(doc.designNumber)!;
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              imageUrl:        donor.imageUrl,
              storagePath:     donor.storagePath,
              storageProvider: donor.storageProvider! as "backblaze",
            },
          },
        },
      };
    });

    try {
      const result = await Catalog.bulkWrite(operations, { ordered: false });
      backfilled = result.modifiedCount ?? 0;
      console.log(`✓ Backfilled ${backfilled} SKU(s)`);
    } catch (err) {
      const bulkErr = err as { result?: { modifiedCount?: number }; writeErrors?: { index: number; errmsg: string }[] };
      backfilled = bulkErr.result?.modifiedCount ?? 0;
      failed     = bulkErr.writeErrors?.length   ?? 0;

      bulkErr.writeErrors?.forEach((we) => {
        const doc = toBackfill[we.index];
        errors.push({ sku: doc?.sku ?? "unknown", error: we.errmsg });
        console.log(`  ✗ ${doc?.sku} → ${we.errmsg}`);
      });

      console.log(`✓ Backfilled ${backfilled} SKU(s) — ${failed} failed`);
    }
  }

  // ── Step 5: log ───────────────────────────────────────────────────────────

  const logPath = writeLogFile({
    timestamp:     new Date().toISOString(),
    totalMissing:  missingDocs.length,
    backfilled,
    failed,
    trulyMissing:  trulyMissing.map((d) => ({ sku: d.sku, designNumber: d.designNumber })),
    errors,
  });

  console.log(`\n✓ Full detail written to: ${logPath}`);

  if (trulyMissing.length > 0) {
    console.log(
      `\n⚠ ${trulyMissing.length} SKU(s) have no sibling with an imageUrl.` +
      `\n  These need a physical image file — run upload-images.ts once you have them.`
    );
  } else {
    console.log("\n✓ All missing SKUs backfilled successfully.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});