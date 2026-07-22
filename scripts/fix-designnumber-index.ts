/**
 * scripts/fix-designnumber-index.ts
 *
 * One-time migration: drops the stale unique index on designNumber.
 * designNumber is NOT unique — the same design can have multiple SKUs
 * with different weights, purities, etc. Only `sku` is unique.
 *
 * Run once: npx tsx scripts/fix-designnumber-index.ts
 */

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";

async function main() {
  await connectToDatabase();
  console.log("✓ Connected to MongoDB\n");

  const collection = mongoose.connection.collection("catalogs");

  // List current indexes so we know what we're dealing with
  const indexes = await collection.indexes();
  console.log("Current indexes on catalogs:");
  indexes.forEach((idx) => console.log(" ", JSON.stringify(idx)));
  console.log();

  // Drop the bad unique index if it exists
  const hasBadIndex = indexes.some(
    (idx) =>
      idx.key?.designNumber !== undefined &&
      idx.unique === true
  );

  if (hasBadIndex) {
    await collection.dropIndex("designNumber_1");
    console.log("✓ Dropped unique index on designNumber");
  } else {
    console.log("✓ No unique index on designNumber found — nothing to drop");
  }

  // Re-create as a non-unique index (for search performance)
  await collection.createIndex({ designNumber: 1 }, { unique: false });
  console.log("✓ Re-created designNumber as non-unique index\n");

  // Confirm final state
  const finalIndexes = await collection.indexes();
  console.log("Final indexes on catalogs:");
  finalIndexes.forEach((idx) => console.log(" ", JSON.stringify(idx)));

  // In fix-designnumber-index.ts — add after the designNumber fix

  const deadIndexes = ["inCatalogue_1", "inStock_1"];

  for (const indexName of deadIndexes) {
    const exists = finalIndexes.some((idx) => idx.name === indexName);
    if (exists) {
      await collection.dropIndex(indexName);
      console.log(`✓ Dropped dead index: ${indexName}`);
    } else {
      console.log(`✓ ${indexName} already gone — nothing to drop`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});