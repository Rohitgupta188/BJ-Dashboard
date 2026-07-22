/**
 * scripts/import-catalog.ts
 *
 * Strict catalog import from CATALOGUE_Products.xlsx + INSTOCK_Products.xlsx.
 *
 * Fixes the root cause of the 9,998-vs-12,000 gap: the previous version
 * upserted on `sku` with no pre-validation, so any row with a duplicate or
 * blank SKU silently overwrote a previously-imported document instead of
 * erroring. This version:
 *
 *   1. Validates every source column exists before reading a single row.
 *   2. Validates every row has the fields Catalog requires (sku, designNumber,
 *      imageName, rfid) — Mongoose schema validators do NOT run for
 *      bulkWrite() updateOne operations by default, so this has to happen
 *      in plain JS before we ever touch MongoDB.
 *   3. Detects duplicate `sku` values across BOTH files combined, BEFORE
 *      writing anything — duplicate groups are excluded from the import
 *      entirely (not silently merged) and logged for manual resolution.
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

// ─── Column contract ────────────────────────────────────────────────────────
// If a source file's header row doesn't contain these, we abort before
// reading a single data row — rather than importing 12,000 blank fields.
const REQUIRED_SOURCE_COLUMNS = ["RFID Tag", "SKU Number", "Design Number", "Image Name"];

interface NormalizedRow {
  rfid: string;
  sku: string;
  designNumber: string;
  imageName: string;
  itemType: string;
  grossWeight: number;
  netWeight: number;
  collectionLine: string;
  metalType: string;
  metalPurity: string;
  __source: "catalogue" | "stock";
  __sourceFile: string;
  __rowNumber: number; // 1-indexed Excel row, accounting for the header row
}

function readExcel(filePath: string): any[] {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any>(sheet);
}

function validateHeaders(rows: any[], sourceFile: string): void {
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
  row: any,
  source: "catalogue" | "stock",
  sourceFile: string,
  rowNumber: number
): NormalizedRow {
  return {
    rfid: String(row["RFID Tag"] || "").trim(),
    sku: String(row["SKU Number"] || "").trim(),
    designNumber: String(row["Design Number"] || "").trim(),
    imageName: String(row["Image Name"] || "").trim(),
    itemType: String(row["Item Type"] || "").trim(),
    grossWeight: Number(row["Gross Weight"]) || 0,
    netWeight: Number(row["Net Weight"]) || 0,
    collectionLine: String(row["Collection Line"] || "").trim(),
    metalType: String(row["Metal Type"] || "").trim(),
    metalPurity: String(row["Metal Purity"] || "").trim(),
    __source: source,
    __sourceFile: sourceFile,
    __rowNumber: rowNumber,
  };
}

const REQUIRED_ROW_FIELDS: (keyof NormalizedRow)[] = ["rfid", "sku", "designNumber", "imageName"];

function findMissingFields(row: NormalizedRow): string[] {
  return REQUIRED_ROW_FIELDS.filter((field) => !row[field]);
}

function writeLogFile(content: object): string {
  const logsDir = path.join(process.cwd(), "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const fileName = `import-catalog-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(logsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  return filePath;
}

async function main() {
  try {
    await connectToDatabase();
    console.log("✓ Connected to MongoDB\n");

    const catalogueFile = path.join(process.cwd(), "data", "CATALOGUE_Products.xlsx");
    const stockFile = path.join(process.cwd(), "data", "INSTOCK_Products.xlsx");

    const catalogueRows = readExcel(catalogueFile);
    const stockRows = readExcel(stockFile);

    validateHeaders(catalogueRows, "CATALOGUE_Products.xlsx");
    validateHeaders(stockRows, "INSTOCK_Products.xlsx");
    console.log("✓ Source file headers validated\n");

    console.log(`Catalogue rows: ${catalogueRows.length}`);
    console.log(`Stock rows: ${stockRows.length}`);

    const allRows: NormalizedRow[] = [
      ...catalogueRows.map((row, i) => normalizeRow(row, "catalogue", "CATALOGUE_Products.xlsx", i + 2)),
      ...stockRows.map((row, i) => normalizeRow(row, "stock", "INSTOCK_Products.xlsx", i + 2)),
    ];
    console.log(`Total rows: ${allRows.length}\n`);

    // ── Step 1: required-field validation ────────────────────────────────
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
      if (invalidRows.length > 15) console.log(`  ...and ${invalidRows.length - 15} more (see log file)`);
      console.log();
    }

    // ── Step 2: group by sku, then decide merge vs. exclude ────────────────
    //
    // A SKU appearing once in catalogue AND once in stock is NOT bad data —
    // it's one physical item with two simultaneous states. Those get merged
    // into a single document with both flags set true.
    //
    // A SKU appearing more than once WITHIN the same file is real bad data
    // (a genuine duplicate row) — those groups are excluded entirely and
    // logged, same as before.
    interface MergedRow extends NormalizedRow {
      isCatalog: boolean;
      isInstock: boolean;
    }

    const skuGroups = new Map<string, NormalizedRow[]>();
    for (const row of fieldValidRows) {
      const group = skuGroups.get(row.sku) || [];
      group.push(row);
      skuGroups.set(row.sku, group);
    }

    const excludedGroups: NormalizedRow[][] = [];
    const mergedRows: MergedRow[] = [];
    const mergeConflicts: { sku: string; field: string; catalogueValue: string; stockValue: string }[] = [];

    for (const group of skuGroups.values()) {
      const catalogueRows = group.filter((r) => r.__source === "catalogue");
      const stockRows = group.filter((r) => r.__source === "stock");

      // Real duplicate: more than one row from the SAME file. Can't safely
      // pick a winner — exclude the whole group.
      if (catalogueRows.length > 1 || stockRows.length > 1) {
        excludedGroups.push(group);
        continue;
      }

      const catalogueRow = catalogueRows[0];
      const stockRow = stockRows[0];
      const primaryRow = stockRow || catalogueRow; // stock data wins on conflicting fields — it reflects current physical reality

      // Single-sheet row, no overlap — straightforward.
      if (!catalogueRow || !stockRow) {
        mergedRows.push({
          ...primaryRow,
          isCatalog: !!catalogueRow,
          isInstock: !!stockRow,
        });
        continue;
      }

      // Legitimate cross-sheet overlap. Flag (but don't block on) any field
      // disagreement between the two rows — worth knowing about even though
      // we proceed with stock's values.
      const fieldsToCompare: (keyof NormalizedRow)[] = [
        "designNumber",
        "grossWeight",
        "netWeight",
        "metalType",
        "metalPurity",
      ];
      for (const field of fieldsToCompare) {
        if (String(catalogueRow[field]) !== String(stockRow[field])) {
          mergeConflicts.push({
            sku: primaryRow.sku,
            field,
            catalogueValue: String(catalogueRow[field]),
            stockValue: String(stockRow[field]),
          });
        }
      }

      mergedRows.push({
        ...primaryRow,
        isCatalog: true,
        isInstock: true,
      });
    }

    if (excludedGroups.length > 0) {
      const excludedRowCount = excludedGroups.reduce((sum, g) => sum + g.length, 0);
      console.log(
        `⚠ ${excludedGroups.length} genuine duplicate SKU group(s) found (${excludedRowCount} rows, same file) — EXCLUDED from import:`
      );
      excludedGroups.slice(0, 10).forEach((group) => {
        console.log(`  sku="${group[0].sku}":`);
        group.forEach((row) =>
          console.log(`    - ${row.__sourceFile} row ${row.__rowNumber} (designNumber="${row.designNumber}")`)
        );
      });
      if (excludedGroups.length > 10) console.log(`  ...and ${excludedGroups.length - 10} more groups (see log file)`);
      console.log();
    }

    const mergedCount = mergedRows.filter((r) => r.isCatalog && r.isInstock).length;
    if (mergedCount > 0) {
      console.log(`↺ ${mergedCount} SKU(s) merged — present in both catalogue and stock, now a single document\n`);
    }

    if (mergeConflicts.length > 0) {
      console.log(`ℹ ${mergeConflicts.length} field disagreement(s) between catalogue/stock rows for merged SKUs (stock value used):`);
      mergeConflicts.slice(0, 10).forEach((c) =>
        console.log(`  sku="${c.sku}" ${c.field}: catalogue="${c.catalogueValue}" vs stock="${c.stockValue}"`)
      );
      if (mergeConflicts.length > 10) console.log(`  ...and ${mergeConflicts.length - 10} more (see log file)`);
      console.log();
    }

    console.log(`✓ ${mergedRows.length} row(s) passed validation and are ready to import\n`);

    // ── Step 3: bulk write only the clean, merged rows ──────────────────────
    const operations = mergedRows.map((row) => ({
      updateOne: {
        filter: { sku: row.sku },
        update: {
          $set: {
            rfid: row.rfid,
            sku: row.sku,
            designNumber: row.designNumber,
            imageName: row.imageName,
            itemStatus: row.isInstock ? "INSTOCK" : "CATALOGUE", // derived, kept for backward-compat filtering
            isCatalog: row.isCatalog,
            isInstock: row.isInstock,
            itemType: row.itemType,
            grossWeight: row.grossWeight,
            netWeight: row.netWeight,
            collectionLine: row.collectionLine,
            metalType: row.metalType,
            metalPurity: row.metalPurity,
          },
        },
        upsert: true,
      },
    }));

    console.log("Starting bulk import...\n");

    let writeErrors: any[] = [];
    let result: any = null;

    if (operations.length > 0) {
      try {
        result = await Catalog.bulkWrite(operations, { ordered: false });
      } catch (err: any) {
        // With ordered:false, a thrown MongoBulkWriteError still carries the
        // partial success counts plus the specific failures — don't just log
        // the error and move on, surface exactly which rows failed and why.
        result = err.result || null;
        writeErrors = err.writeErrors || [];
      }
    }

    console.log("--- Import summary ---");
    console.log(`Inserted: ${result?.upsertedCount ?? result?.insertedCount ?? 0}`);
    console.log(`Updated (existing docs matched): ${result?.modifiedCount ?? 0}`);

    if (writeErrors.length > 0) {
      console.log(`\n❌ ${writeErrors.length} write error(s):`);
      writeErrors.slice(0, 15).forEach((we) => {
        const failedRow = mergedRows[we.index];
        console.log(
          `  - ${failedRow?.__sourceFile} row ${failedRow?.__rowNumber} (sku="${failedRow?.sku}"): ${we.errmsg}`
        );
      });
      if (writeErrors.length > 15) console.log(`  ...and ${writeErrors.length - 15} more (see log file)`);
    }

    // ── Step 4: full detail to a log file (console stays readable) ─────────
    const logPath = writeLogFile({
      timestamp: new Date().toISOString(),
      totalRowsRead: allRows.length,
      validRowsImported: mergedRows.length,
      mergedAcrossSheets: mergedCount,
      invalidRows: invalidRows.map(({ row, missingFields }) => ({
        sourceFile: row.__sourceFile,
        rowNumber: row.__rowNumber,
        designNumber: row.designNumber,
        sku: row.sku,
        missingFields,
      })),
      excludedDuplicateGroups: excludedGroups.map((group) =>
        group.map((row) => ({
          sourceFile: row.__sourceFile,
          rowNumber: row.__rowNumber,
          designNumber: row.designNumber,
          sku: row.sku,
        }))
      ),
      mergeFieldConflicts: mergeConflicts,
      writeErrors: writeErrors.map((we) => ({
        index: we.index,
        errmsg: we.errmsg,
        row: mergedRows[we.index],
      })),
    });

    console.log(`\n✓ Full detail written to: ${logPath}`);

    const totalIssues = invalidRows.length + excludedGroups.reduce((sum, g) => sum + g.length, 0);
    if (totalIssues > 0) {
      console.log(
        `\n⚠ ${totalIssues} row(s) were NOT imported (missing fields or duplicate SKUs). Fix the source file and re-run — already-imported rows will simply be updated, not duplicated.`
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