/**
 * scripts/find-missing-images.ts
 *
 * Finds all catalog documents that have no imageUrl yet.
 * Outputs a clean list of imageName values — hand this to your
 * employee so they know exactly which files to gather.
 *
 * Also writes two files to logs/:
 *   missing-images.txt  — one imageName per line (easy to share)
 *   missing-images.json — full detail if you need designNumber too
 *
 * Run: npx tsx scripts/find-missing-images.ts
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";

async function main() {
  await connectToDatabase();
  console.log("✓ Connected to MongoDB\n");

  const total = await Catalog.countDocuments({});
  const withImage = await Catalog.countDocuments({
    imageUrl: { $exists: true, $ne: null },
  });
  const missing = total - withImage;

  console.log(`Total products:     ${total}`);
  console.log(`Have imageUrl:      ${withImage}`);
  console.log(`Missing imageUrl:   ${missing}\n`);

  if (missing === 0) {
    console.log("✓ All products have an imageUrl. Nothing to gather.");
    process.exit(0);
  }

  const docs = await Catalog.find({
    $or: [{ imageUrl: { $exists: false } }, { imageUrl: null }],
  })
    .select("designNumber imageName")
    .sort({ imageName: 1 })
    .lean();

  // ── Console preview (first 5) ──────────────────────────────────────────
  console.log("Missing (first 5):");
  docs.slice(0, 5).forEach((d: any) => {
    console.log(`  ${d.designNumber.padEnd(20)} ${d.imageName}`);
  });
  if (docs.length > 5) {
    console.log(`  ...and ${docs.length - 5} more (see log files)\n`);
  }

  // ── Write log files ─────────────────────────────────────────────────────
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  // Plain text — one imageName per line, easy to share with employee
  const txtPath = path.join(logsDir, "missing-images.txt");
  fs.writeFileSync(
    txtPath,
    [...new Set(docs.map((d: any) => d.imageName))].join("\n"),
    "utf8"
  );

  // JSON — includes designNumber for cross-referencing
  const jsonPath = path.join(logsDir, "missing-images.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      docs.map((d: any) => ({
        designNumber: d.designNumber,
        imageName: d.imageName,
      })),
      null,
      2
    ),
    "utf8"
  );

  console.log(`✓ missing-images.txt  → ${txtPath}`);
  console.log(`✓ missing-images.json → ${jsonPath}`);
  console.log(`\nHand missing-images.txt to your employee.`);
  console.log(
    `Once gathered, place files in images/full and run:\n  npx tsx scripts/upload-images.ts --dir images/full`
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});