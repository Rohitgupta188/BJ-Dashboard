/**
 * scripts/import-catalog.ts
 *
 * Strict catalog import from INSTOCK_Products.xlsx.
 *
 *   1. Validates every source column exists before reading a single row.
 *   2. Validates every row has the fields Catalog requires (sku, designNumber,
 *      imageName, rfid) — Mongoose schema validators do NOT run for
 *      bulkWrite() updateOne operations by default, so this has to happen
 *      in plain JS before we ever touch MongoDB.
 *   3. Detects duplicate `sku` values BEFORE writing anything — duplicate
 *      groups are excluded entirely (not silently merged) and logged.
 *   4. Only rows that are both valid and sku-unique get bulkWritten.
 *   5. Logs a full report to console (summary) and to a JSON file under
 *      logs/ (full detail — every bad row, every duplicate group, every
 *      write error with its original row context).
 *
 * Run with: npx tsx scripts/import-catalog.ts
 */

import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import * as XLSX from "xlsx";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";

// ─── Column contract ──────────────────────────────────────────────────────────
const REQUIRED_SOURCE_COLUMNS = [
  "RFID Tag",
  "SKU Number",
  "Design Number",
  "Image Name",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedRow {
  rfid: string;
  sku: string;
  designNumber: string;
  imageName: string;
  itemType: string;
  grossWeight: number;
  netWeight: number;
  stoneWeight: number;
  collectionLine: string;
  metalType: string;
  metalPurity: string;
  __source: "catalogue" | "stock";
  __sourceFile: string;
  __rowNumber: number;
}

interface MergedRow extends NormalizedRow {
  isCatalog: boolean;
  isInstock: boolean;
}

interface BulkWriteError {
  index: number;
  errmsg: string;
}

interface BulkWriteResult {
  upsertedCount?: number;
  insertedCount?: number;
  modifiedCount?: number;
}

// ─── Excel helpers ────────────────────────────────────────────────────────────

function readExcel(filePath: string): Record<string, unknown>[] {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
}

function validateHeaders(rows: Record<string, unknown>[], sourceFile: string): void {
  if (rows.length === 0) {
    throw new Error(`${sourceFile} has no data rows. Aborting before any import.`);
  }
  const actualColumns = new Set(Object.keys(rows[0]));
  const missing = REQUIRED_SOURCE_COLUMNS.filter((col) => !actualColumns.has(col));
  if (missing.length > 0) {
    throw new Error(
      `${sourceFile} is missing required column(s): ${missing.join(", ")}. ` +
        `Found columns: ${Array.from(actualColumns).join(", ")}. Aborting before any import.`
    );
  }
}

function normalizeRow(
  row: Record<string, unknown>,
  source: "catalogue" | "stock",
  sourceFile: string,
  rowNumber: number
): NormalizedRow {
  return {
    rfid:           String(row["RFID Tag"]        || "").trim(),
    sku:            String(row["SKU Number"]       || "").trim(),
    designNumber:   String(row["Design Number"]    || "").trim(),
    imageName:      String(row["Image Name"]       || "").trim(),
    itemType:       String(row["Item Type"]        || "").trim(),
    grossWeight:    Number(row["Gross Weight"])    || 0,
    netWeight:      Number(row["Net Weight"])      || 0,
    stoneWeight:    Number(row["Stone Weight"])    || 0,
    collectionLine: String(row["Collection Line"]  || "").trim(),
    metalType:      String(row["Metal Type"]       || "").trim(),
    metalPurity:    String(row["Metal Purity"]     || "").trim(),
    __source:       source,
    __sourceFile:   sourceFile,
    __rowNumber:    rowNumber,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_ROW_FIELDS: (keyof NormalizedRow)[] = [
  "rfid",
  "sku",
  "designNumber",
  "imageName",
];

function findMissingFields(row: NormalizedRow): string[] {
  return REQUIRED_ROW_FIELDS.filter((field) => !row[field]);
}

// ─── Log file ─────────────────────────────────────────────────────────────────

function writeLogFile(content: object): string {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const fileName = `import-catalog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(logsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    await connectToDatabase();
    console.log("✓ Connected to MongoDB\n");

    const stockFile = path.join(process.cwd(), "data", "INSTOCK_Products.xlsx");
    const stockRows = readExcel(stockFile);

    validateHeaders(stockRows, "INSTOCK_Products.xlsx");
    console.log("✓ Source file headers validated\n");
    console.log(`Stock rows: ${stockRows.length}`);

    const allRows: NormalizedRow[] = stockRows.map((row, i) =>
      normalizeRow(row, "stock", "INSTOCK_Products.xlsx", i + 2)
    );
    console.log(`Total rows: ${allRows.length}\n`);

    // ── Step 1: required-field validation ─────────────────────────────────────

    const invalidRows: { row: NormalizedRow; missingFields: string[] }[] = [];
    const fieldValidRows: NormalizedRow[] = [];

    for (const row of allRows) {
      const missingFields = findMissingFields(row);
      if (missingFields.length > 0) {
        invalidRows.push({ row, missingFields });
      } else {
        fieldValidRows.push(row);
      }
    }

    if (invalidRows.length > 0) {
      console.log(`⚠ ${invalidRows.length} row(s) missing required field(s):`);
      invalidRows.slice(0, 15).forEach(({ row, missingFields }) => {
        console.log(
          `  - ${row.__sourceFile} row ${row.__rowNumber} (designNumber="${row.designNumber}"): missing ${missingFields.join(", ")}`
        );
      });
      if (invalidRows.length > 15)
        console.log(`  ...and ${invalidRows.length - 15} more (see log file)`);
      console.log();
    }

    // ── Step 2: detect duplicate SKUs, exclude entire group ───────────────────

    const skuGroups = new Map<string, NormalizedRow[]>();
    for (const row of fieldValidRows) {
      const group = skuGroups.get(row.sku) ?? [];
      group.push(row);
      skuGroups.set(row.sku, group);
    }

    const excludedGroups: NormalizedRow[][] = [];
    const mergedRows: MergedRow[] = [];

    for (const group of skuGroups.values()) {
      if (group.length > 1) {
        // Same SKU appears more than once in the same file — genuine bad data.
        // Can't safely pick a winner — exclude the whole group.
        excludedGroups.push(group);
        continue;
      }

      mergedRows.push({
        ...group[0],
        isCatalog: false,
        isInstock: true,
      });
    }

    if (excludedGroups.length > 0) {
      const excludedRowCount = excludedGroups.reduce((sum, g) => sum + g.length, 0);
      console.log(
        `⚠ ${excludedGroups.length} genuine duplicate SKU group(s) found (${excludedRowCount} rows) — EXCLUDED from import:`
      );
      excludedGroups.slice(0, 10).forEach((group) => {
        console.log(`  sku="${group[0].sku}":`);
        group.forEach((row) =>
          console.log(
            `    - ${row.__sourceFile} row ${row.__rowNumber} (designNumber="${row.designNumber}")`
          )
        );
      });
      if (excludedGroups.length > 10)
        console.log(`  ...and ${excludedGroups.length - 10} more groups (see log file)`);
      console.log();
    }

    console.log(`✓ ${mergedRows.length} row(s) passed validation and are ready to import\n`);

    // ── Step 3: bulk write only clean rows ────────────────────────────────────

    const operations = mergedRows.map((row) => ({
      updateOne: {
        filter: { sku: row.sku },
        update: {
          $set: {
            rfid:           row.rfid,
            sku:            row.sku,
            designNumber:   row.designNumber,
            imageName:      row.imageName,
            itemStatus:     (row.isInstock ? "INSTOCK" : "CATALOGUE") as "INSTOCK" | "CATALOGUE",
            isCatalog:      row.isCatalog,
            isInstock:      row.isInstock,
            itemType:       row.itemType,
            grossWeight:    row.grossWeight,
            netWeight:      row.netWeight,
            stoneWeight:    row.stoneWeight,
            collectionLine: row.collectionLine,
            metalType:      row.metalType,
            metalPurity:    row.metalPurity,
          },
        },
        upsert: true,
      },
    }));

    console.log("Starting bulk import...\n");

    let writeErrors: BulkWriteError[] = [];
    let result: BulkWriteResult | null = null;

    if (operations.length > 0) {
      try {
        result = await Catalog.bulkWrite(operations, { ordered: false });
      } catch (err) {
        // ordered:false — MongoBulkWriteError still carries partial success
        // counts and the specific failures. Surface them instead of swallowing.
        const bulkErr = err as { result?: BulkWriteResult; writeErrors?: BulkWriteError[] };
        result       = bulkErr.result      ?? null;
        writeErrors  = bulkErr.writeErrors ?? [];
      }
    }

    console.log("--- Import summary ---");
    console.log(`Inserted:                       ${result?.upsertedCount  ?? result?.insertedCount ?? 0}`);
    console.log(`Updated (existing docs matched): ${result?.modifiedCount ?? 0}`);

    if (writeErrors.length > 0) {
      console.log(`\n❌ ${writeErrors.length} write error(s):`);
      writeErrors.slice(0, 15).forEach((we) => {
        const failedRow = mergedRows[we.index];
        console.log(
          `  - ${failedRow?.__sourceFile} row ${failedRow?.__rowNumber} (sku="${failedRow?.sku}"): ${we.errmsg}`
        );
      });
      if (writeErrors.length > 15)
        console.log(`  ...and ${writeErrors.length - 15} more (see log file)`);
    }

    // ── Step 4: write full detail to log file ─────────────────────────────────

    const logPath = writeLogFile({
      timestamp:       new Date().toISOString(),
      totalRowsRead:   allRows.length,
      validRowsImported: mergedRows.length,
      invalidRows: invalidRows.map(({ row, missingFields }) => ({
        sourceFile:   row.__sourceFile,
        rowNumber:    row.__rowNumber,
        designNumber: row.designNumber,
        sku:          row.sku,
        missingFields,
      })),
      excludedDuplicateGroups: excludedGroups.map((group) =>
        group.map((row) => ({
          sourceFile:   row.__sourceFile,
          rowNumber:    row.__rowNumber,
          designNumber: row.designNumber,
          sku:          row.sku,
        }))
      ),
      writeErrors: writeErrors.map((we) => ({
        index:  we.index,
        errmsg: we.errmsg,
        row:    mergedRows[we.index],
      })),
    });

    console.log(`\n✓ Full detail written to: ${logPath}`);

    const totalIssues =
      invalidRows.length +
      excludedGroups.reduce((sum, g) => sum + g.length, 0);

    if (totalIssues > 0) {
      console.log(
        `\n⚠ ${totalIssues} row(s) were NOT imported (missing fields or duplicate SKUs). ` +
          `Fix the source file and re-run — already-imported rows will simply be updated, not duplicated.`
      );
    } else {
      console.log("\n✓ All rows imported cleanly. No validation issues found.");
    }
  } catch (error) {
    console.error("\n❌ Import aborted due to a fatal error:");
    console.error(error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();