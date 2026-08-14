/**
 * POST /api/catalog/import
 *
 * Accepts a multipart/form-data request with:
 *   file        — .xlsx file
 *   type        — "catalogue" | "instock"
 *   replace     — "true" | "false"  (Replace Existing Data toggle)
 *
 * Pipeline:
 *   Excel file → parseExcelBuffer() → validation → duplicate check → bulkWrite
 *
 * The parsing and structural validation happen entirely in lib/excel/parse.ts.
 * This route only handles HTTP concerns and the MongoDB write strategy.
 */

import { NextRequest, NextResponse }         from "next/server";
import Catalog                               from "@/models/Catalog";
import { connectToDatabase }                 from "@/lib/db";
import { parseExcelBuffer }                  from "@/lib/excel/parse";
import { withAuth, type AuthenticatedRequest } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RowError {
  rowNumber: number;
  sku:       string;
  reason:    string;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const POST = withAuth(async (req: NextRequest, _ctx: AuthenticatedRequest) => {
  try {
    await connectToDatabase();

    const formData = await req.formData();
    const file = formData.get("file")    as File   | null;
    const type     = (formData.get("type")   as string | null) ?? "instock";
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
    if (!["catalogue", "instock"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "catalogue" or "instock".' },
        { status: 400 }
      );
    }

    // ── Parse (pure layer — structural validation included) ────────────────
    const buffer      = Buffer.from(await file.arrayBuffer());
    const parseResult = await parseExcelBuffer(buffer);

    // If the parse layer returned errors with no rows, it means a fatal
    // structural problem (missing columns, unreadable file, too many rows).
    if (parseResult.rows.length === 0) {
      const firstError = parseResult.errors[0];
      return NextResponse.json(
        { error: firstError?.reason ?? "No valid rows found in file." },
        { status: 422 }
      );
    }

    const errors: RowError[] = parseResult.errors.map((e) => ({
      rowNumber: e.rowNumber,
      sku:       e.sku,
      reason:    e.reason,
    }));

    // ── Duplicate SKU detection within file ────────────────────────────────
    const skuGroups = new Map<string, typeof parseResult.rows>();
    for (const row of parseResult.rows) {
      const group = skuGroups.get(row.sku) ?? [];
      group.push(row);
      skuGroups.set(row.sku, group);
    }

    const cleanRows: typeof parseResult.rows = [];
    for (const [sku, group] of skuGroups) {
      if (group.length > 1) {
        group.forEach((r) =>
          errors.push({
            rowNumber: r.rowNumber,
            sku,
            reason: "Duplicate SKU within file — entire group excluded.",
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
      // ── Replace mode: upsert everything ────────────────────────────────
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
              size:           row.size,
              itemCategory:   row.itemCategory,
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
        updated  = result.modifiedCount ?? 0;
      } catch (err) {
        const bulkErr = err as {
          result?:      { upsertedCount?: number; modifiedCount?: number };
          writeErrors?: { index: number; errmsg: string }[];
        };
        inserted = bulkErr.result?.upsertedCount ?? 0;
        updated  = bulkErr.result?.modifiedCount ?? 0;
        bulkErr.writeErrors?.forEach((we) => {
          const row = cleanRows[we.index];
          errors.push({ rowNumber: row?.rowNumber, sku: row?.sku, reason: we.errmsg });
        });
      }

    } else {
      // ── Skip mode: only insert new SKUs ────────────────────────────────
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
              size:           row.size,
              itemCategory:   row.itemCategory,
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
            result?:      { insertedCount?: number };
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
