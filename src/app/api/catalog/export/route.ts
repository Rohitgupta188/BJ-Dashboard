/**
 * GET /api/catalog/export?type=catalogue|instock
 *
 * Streams a .xlsx file back to the browser as a download.
 * Columns match the mandatory import format so the exported file
 * can be edited and re-imported directly.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Catalog from "@/models/Catalog";
import { connectToDatabase } from "@/lib/db";

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
                "designNumber sku grossWeight netWeight metalPurity metalType itemType rfid collectionLine stoneWeight imageName"
            )
            .sort({ designNumber: 1 })
            .lean();

        if (docs.length === 0) {
            return NextResponse.json(
                { error: `No ${itemStatus} products found.` },
                { status: 404 }
            );
        }

        // ── Build xlsx ─────────────────────────────────────────────────────────────

        // ✅ new order
        const rows = docs.map((doc) => ({
            "RFID Tag": doc.rfid ?? "",
            "SKU Number": doc.sku ?? "",
            "Design Number": doc.designNumber ?? "",
            "Image Name": doc.imageName ?? "",
            "Item Status": doc.itemStatus ?? "",
            "Item Type": doc.itemType ?? "",
            "Size": (doc as any).size ?? "",
            "Gross Weight": doc.grossWeight ?? 0,
            "Net Weight": doc.netWeight ?? 0,
            "Collection Line": doc.collectionLine ?? "",
            "Item Category": (doc as any).itemCategory ?? "",
            "Metal Type": doc.metalType ?? "",
            "Metal Purity": doc.metalPurity ?? "",
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, itemStatus);

        // Set column widths for readability
        worksheet["!cols"] = [
            { wch: 14 }, // RFID Tag
            { wch: 16 }, // SKU Number
            { wch: 18 }, // Design Number
            { wch: 22 }, // Image Name
            { wch: 12 }, // Item Status
            { wch: 14 }, // Item Type
            { wch: 8 }, // Size
            { wch: 13 }, // Gross Weight
            { wch: 12 }, // Net Weight
            { wch: 18 }, // Collection Line
            { wch: 16 }, // Item Category
            { wch: 12 }, // Metal Type
            { wch: 13 }, // Metal Purity
        ];

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const filename = `BJ_${itemStatus}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        console.error("[GET /api/catalog/export]", err);
        return NextResponse.json({ error: "Server error during export." }, { status: 500 });
    }
}