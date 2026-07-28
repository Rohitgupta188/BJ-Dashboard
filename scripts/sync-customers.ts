/**
 * scripts/sync-customers.ts
 *
 * One-time (or on-demand) full sync of all rows from the Google Sheet
 * into the Customer collection in MongoDB.
 *
 * The Drive webhook only fires on NEW changes — it cannot backfill rows
 * that were already in the sheet before the webhook was registered.
 * Run this script once to import all existing customer data.
 *
 * Usage:
 *   npm run sync:customers
 *
 * Required in .env.local:
 *   MONGODB_URI
 *   GOOGLE_SHEET_ID          — ID of the customer registration Google Sheet
 *   GOOGLE_CLIENT_EMAIL      — service account email  ┐ OR use
 *   GOOGLE_PRIVATE_KEY       — service account key    ┘ GOOGLE_SERVICE_ACCOUNT_KEY (full JSON)
 */

import mongoose from "mongoose";
import { processCustomerSheet } from "../src/lib/drive/processors/sheets";

// ─── Environment ──────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI;
const SHEET_ID    = process.env.GOOGLE_SHEET_ID;

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in .env.local");
  process.exit(1);
}

if (!SHEET_ID) {
  console.error("❌  GOOGLE_SHEET_ID is not set in .env.local");
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔗  Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI as string);
  console.log("✅  MongoDB connected\n");

  console.log(`📋  Reading Google Sheet: ${SHEET_ID}`);
  console.log("    This will upsert every customer row (matched by phone number).\n");

  const result = await processCustomerSheet(SHEET_ID as string);

  console.log("\n─────────────────────────────────────────");
  console.log(`✅  Sync complete`);
  console.log(`    Upserted : ${result.upserted}`);
  console.log(`    Skipped  : ${result.skipped}  (rows missing name or phone)`);
  console.log(`    Errors   : ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.warn("\n⚠️  Row errors:");
    result.errors.forEach((e) => console.warn("   ", e));
  }

  await mongoose.disconnect();
  console.log("\n🔌  MongoDB disconnected. Done.");
}

main().catch((err) => {
  console.error("❌  Sync failed:", err instanceof Error ? err.message : err);
  mongoose.disconnect();
  process.exit(1);
});
