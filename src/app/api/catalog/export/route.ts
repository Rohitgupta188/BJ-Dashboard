/**
 * GET /api/catalog/export?type=catalogue|instock
 *
 * Streams a .xlsx file back to the browser as a download.
 * Columns match the mandatory import format so the exported file
 * can be edited and re-imported directly.
 */

import { NextRequest, NextResponse } from "next/server";
import Catalog                       from "@/models/Catalog";
import { connectToDatabase }         from "@/lib/db";
import { buildCatalogExcel }         from "@/lib/excel/export";
import type { CatalogExportRow }     from "@/lib/excel/export";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "instock";

    if (!["catalogue", "instock"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "catalogue" or "instock".' },
        { status: 400 }
      );
    }

    const itemStatus = type === "catalogue" ? "CATALOGUE" : "INSTOCK";

    const docs = await Catalog.find({ itemStatus })
      .select(
        "designNumber sku grossWeight netWeight metalPurity metalType " +
        "itemType rfid collectionLine stoneWeight imageName itemStatus"
      )
      .sort({ designNumber: 1 })
      .lean();

    if (docs.length === 0) {
      return NextResponse.json(
        { error: `No ${itemStatus} products found.` },
        { status: 404 }
      );
    }

    const rows: CatalogExportRow[] = docs.map((doc) => ({
      rfid:           doc.rfid           ?? "",
      sku:            doc.sku            ?? "",
      designNumber:   doc.designNumber   ?? "",
      imageName:      doc.imageName      ?? "",
      itemStatus:     doc.itemStatus     ?? "",
      itemType:       doc.itemType       ?? "",
      size:           (doc as any).size  ?? "",
      grossWeight:    doc.grossWeight    ?? 0,
      netWeight:      doc.netWeight      ?? 0,
      collectionLine: doc.collectionLine ?? "",
      itemCategory:   (doc as any).itemCategory ?? "",
      metalType:      doc.metalType      ?? "",
      metalPurity:    doc.metalPurity    ?? "",
    }));

    const buffer   = await buildCatalogExcel(rows, itemStatus);
    const filename = `BJ_${itemStatus}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });

  } catch (err) {
    console.error("[GET /api/catalog/export]", err);
    return NextResponse.json({ error: "Server error during export." }, { status: 500 });
  }
}
