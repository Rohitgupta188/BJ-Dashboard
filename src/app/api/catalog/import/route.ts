/**
 * POST /api/catalog/import
 *
 * Accepts a multipart/form-data request with:
 *   file        — .xlsx file
 *   type        — "catalogue" | "instock"
 *   replace     — "true" | "false"  (Replace Existing Data toggle)
 *
 * Pipeline:
 *   1. Parse + validate headers — all 8 mandatory columns must exist
 *   2. Validate every row — skip rows with missing required fields
 *   3. Detect duplicate SKUs within the file — exclude entire group
 *   4. bulkWrite with upsert:true (replace=true) or skip existing (replace=false)
 *   5. Return { inserted, updated, skipped, errors[] }
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";

// ─── Column contract ──────────────────────────────────────────────────────────

const MANDATORY_COLUMNS = [
  "RFID Tag",
  "SKU Number",
  "Design Number",
  "Image Name",
  "Item Status",
  "Item Type",
  "Gross Weight",
  "Net Weight",
  "Metal Type",
  "Metal Purity",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedRow {
  sku: string;
  designNumber: string;
  grossWeight: number;
  netWeight: number;
  metalPurity: string;
  metalType: string;
  itemType: string;
  rfid: string;
  collectionLine: string;
  stoneWeight: number;
  imageName: string;
  size: number;
  itemCategory: string;
  rowNumber: number;
}

interface RowError {
  rowNumber: number;
  sku: string;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateHeaders(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return ["File has no data rows."];
  const actual = new Set(Object.keys(rows[0]));
  return MANDATORY_COLUMNS.filter((col) => !actual.has(col));
}

function parseRow(row: Record<string, unknown>, rowNumber: number): ParsedRow {
  return {
    rfid:           String(row["RFID Tag"]         || "").trim(),
    sku:            String(row["SKU Number"]        || "").trim(),
    designNumber:   String(row["Design Number"]     || "").trim(),
    imageName:      String(row["Image Name"]        || "").trim(),
    itemType:       String(row["Item Type"]         || "").trim(),
    grossWeight:    Number(row["Gross Weight"])      || 0,
    netWeight:      Number(row["Net Weight"])        || 0,
    metalPurity:    String(row["Metal Purity"]       || "").trim(),
    metalType:      String(row["Metal Type"]         || "").trim(),
    collectionLine: String(row["Collection Line"]    || "").trim(),
    stoneWeight:    Number(row["Stone Weight"])       || 0,
    size:           Number(row["Size"])               || 0,
    itemCategory:   String(row["Item Category"]      || "").trim(),
    rowNumber,
  };
}

function getMissingFields(row: ParsedRow): string[] {
  const required: (keyof ParsedRow)[] = ["sku", "designNumber", "rfid"];
  return required.filter((f) => !row[f]);
}

import { withAuth, type AuthenticatedRequest } from "@/lib/auth";

// ─── Route ────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, ctx: AuthenticatedRequest) => {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    const type     = (formData.get("type") as string | null) ?? "instock";
    const replace  = formData.get("replace") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!file.name.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Only .xlsx files are supported." },
        { status: 400 }
      );
    }

    // ── Parse Excel ────────────────────────────────────────────────────────────
    const buffer   = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    // ── Header validation ──────────────────────────────────────────────────────
    const missingColumns = validateHeaders(rawRows);
    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          error: `Missing mandatory column(s): ${missingColumns.join(", ")}. ` +
                 `Download the sample Excel to see the correct format.`,
        },
        { status: 422 }
      );
    }

    // ── Row parsing + field validation ─────────────────────────────────────────
    const validRows:   ParsedRow[] = [];
    const errors:      RowError[]  = [];

    rawRows.forEach((raw, i) => {
      const row     = parseRow(raw, i + 2); // +2: header row + 0-index
      const missing = getMissingFields(row);
      if (missing.length > 0) {
        errors.push({
          rowNumber: row.rowNumber,
          sku:       row.sku || "(blank)",
          reason:    `Missing: ${missing.join(", ")}`,
        });
      } else {
        validRows.push(row);
      }
    });

    // ── Duplicate SKU detection within file ────────────────────────────────────
    const skuGroups = new Map<string, ParsedRow[]>();
    for (const row of validRows) {
      const group = skuGroups.get(row.sku) ?? [];
      group.push(row);
      skuGroups.set(row.sku, group);
    }

    const cleanRows:   ParsedRow[] = [];
    for (const [sku, group] of skuGroups) {
      if (group.length > 1) {
        group.forEach((r) =>
          errors.push({
            rowNumber: r.rowNumber,
            sku,
            reason: `Duplicate SKU within file — entire group excluded.`,
          })
        );
      } else {
        cleanRows.push(group[0]);
      }
    }

    if (cleanRows.length === 0) {
      return NextResponse.json({
        inserted: 0,
        updated:  0,
        skipped:  0,
        errors,
        message:  "No valid rows to import.",
      });
    }

    const itemStatus = (type === "catalogue" ? "CATALOGUE" : "INSTOCK") as "CATALOGUE" | "INSTOCK";
    const isCatalog  = type === "catalogue";
    const isInstock  = type === "instock";

    let inserted = 0;
    let updated  = 0;
    let skipped  = 0;

    if (replace) {
      // ── Replace mode: upsert everything ──────────────────────────────────────
      const operations = cleanRows.map((row) => ({
        updateOne: {
          filter: { sku: row.sku },
          update: {
            $set: {
              sku:            row.sku,
              designNumber:   row.designNumber,
              rfid:           row.rfid,
              grossWeight:    row.grossWeight,
              netWeight:      row.netWeight,
              stoneWeight:    row.stoneWeight,
              metalPurity:    row.metalPurity,
              metalType:      row.metalType,
              itemType:       row.itemType,
              collectionLine: row.collectionLine,
              ...(row.imageName && { imageName: row.imageName }),
              itemStatus,
              isCatalog,
              isInstock,
            },
          },
          upsert: true,
        },
      }));

      try {
        const result = await Catalog.bulkWrite(operations, { ordered: false });
        inserted = result.upsertedCount  ?? 0;
        updated  = result.modifiedCount  ?? 0;
      } catch (err) {
        const bulkErr = err as {
          result?: { upsertedCount?: number; modifiedCount?: number };
          writeErrors?: { index: number; errmsg: string }[];
        };
        inserted = bulkErr.result?.upsertedCount  ?? 0;
        updated  = bulkErr.result?.modifiedCount  ?? 0;
        bulkErr.writeErrors?.forEach((we) => {
          const row = cleanRows[we.index];
          errors.push({ rowNumber: row?.rowNumber, sku: row?.sku, reason: we.errmsg });
        });
      }
    } else {
      // ── Skip mode: only insert new SKUs, silently ignore existing ─────────────
      const incomingSkus = cleanRows.map((r) => r.sku);
      const existingDocs = await Catalog.find(
        { sku: { $in: incomingSkus } },
        { sku: 1 }
      ).lean();

      const existingSkus = new Set(existingDocs.map((d) => d.sku));
      const newRows      = cleanRows.filter((r) => !existingSkus.has(r.sku));
      skipped            = cleanRows.length - newRows.length;

      if (newRows.length > 0) {
        const operations = newRows.map((row) => ({
          insertOne: {
            document: {
              sku:            row.sku,
              designNumber:   row.designNumber,
              rfid:           row.rfid,
              grossWeight:    row.grossWeight,
              netWeight:      row.netWeight,
              stoneWeight:    row.stoneWeight,
              metalPurity:    row.metalPurity,
              metalType:      row.metalType,
              itemType:       row.itemType,
              collectionLine: row.collectionLine,
              imageName:      row.imageName || row.designNumber,
              itemStatus,
              isCatalog,
              isInstock,
            },
          },
        }));

        try {
          const result = await Catalog.bulkWrite(operations as any, { ordered: false });
          inserted = result.insertedCount ?? 0;
        } catch (err) {
          const bulkErr = err as {
            result?: { insertedCount?: number };
            writeErrors?: { index: number; errmsg: string }[];
          };
          inserted = bulkErr.result?.insertedCount ?? 0;
          bulkErr.writeErrors?.forEach((we) => {
            const row = newRows[we.index];
            errors.push({ rowNumber: row?.rowNumber, sku: row?.sku, reason: we.errmsg });
          });
        }
      }
    }

    return NextResponse.json({ inserted, updated, skipped, errors });
  } catch (err) {
    console.error("[POST /api/catalog/import]", err);
    return NextResponse.json({ error: "Server error during import." }, { status: 500 });
  }
}, { requireRole: "admin" });