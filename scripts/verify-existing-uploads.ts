/**
 * scripts/verify-existing-uploads.ts
 *
 * Quick sanity check after re-running import-catalog.ts: confirms the
 * already-uploaded documents still have their storage fields intact,
 * and shows their actual values (rather than a hand-built guess).
 *
 * Run with: npx tsx scripts/verify-existing-uploads.ts
 */

import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import mongoose from "mongoose";

async function main() {
  await connectToDatabase();
  console.log("✓ Connected to MongoDB\n");

  const withImage = await Catalog.countDocuments({ imageUrl: { $exists: true, $ne: null } });
  const withoutImage = await Catalog.countDocuments({
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }],
  });

  console.log(`Documents WITH imageUrl: ${withImage}`);
  console.log(`Documents WITHOUT imageUrl: ${withoutImage}\n`);

  const samples = await Catalog.find({ imageUrl: { $exists: true, $ne: null } })
    .select("designNumber sku imageName storageProvider storagePath imageUrl")
    .limit(5)
    .lean();

  console.log("Sample of existing uploaded records:");
  samples.forEach((doc: any) => {
    console.log(`\n  designNumber: ${doc.designNumber}`);
    console.log(`  imageName:    ${doc.imageName}`);
    console.log(`  storagePath:  ${doc.storagePath}`);
    console.log(`  imageUrl:     ${doc.imageUrl}`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});