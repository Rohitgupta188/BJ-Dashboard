/**
 * app/api/catalog/route.ts
 *
 * GET /api/catalog
 *
 * Returns a paginated list of catalog items with the fields needed
 * for the catalog view: image, Design Number, Gr Wt, Metal Purity, Metal Type.
 *
 * Query params (all optional):
 *   page        - page number, default 1
 *   limit       - items per page, default 24
 *   search      - matches against designNumber (case-insensitive)
 *   itemStatus  - exact match filter: "CATALOGUE" | "INSTOCK" (derived field, kept for backward compat)
 *   isCatalog   - "true" | "false" — filters on the real source-of-truth flag
 *   isInstock   - "true" | "false" — filters on the real source-of-truth flag
 *   metalPurity - exact match filter, e.g. "9KT"
 *   metalType   - exact match filter, e.g. "Yellow Gold"
 */

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
    const search = searchParams.get("search")?.trim();
    const itemStatus = searchParams.get("itemStatus")?.trim();
    const isCatalog = searchParams.get("isCatalog")?.trim();
    const isInstock = searchParams.get("isInstock")?.trim();
    const metalPurity = searchParams.get("metalPurity")?.trim();
    const metalType = searchParams.get("metalType")?.trim();

    // Only show items that actually have an image uploaded.
    const filter: Record<string, unknown> = {
      imageUrl: { $exists: true, $ne: null },
    };

    if (search) {
      filter.designNumber = { $regex: search, $options: "i" };
    }
    if (itemStatus) {
      filter.itemStatus = itemStatus; // "CATALOGUE" | "INSTOCK"
    }
    if (isCatalog !== undefined && isCatalog !== "") {
      filter.isCatalog = isCatalog === "true";
    }
    if (isInstock !== undefined && isInstock !== "") {
      filter.isInstock = isInstock === "true";
    }
    if (metalPurity) {
      filter.metalPurity = metalPurity;
    }
    if (metalType) {
      filter.metalType = metalType;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Catalog.find(filter)
        .select(
          "designNumber rfid sku itemStatus isCatalog isInstock itemType grossWeight netWeight collectionLine metalType metalPurity imageUrl"
        )
        .sort({ designNumber: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Catalog.countDocuments(filter),
    ]);

    const catalog = items.map((item: any) => ({
      designNumber: item.designNumber,
      rfid: item.rfid,
      sku: item.sku,
      itemStatus: item.itemStatus,
      isCatalog: item.isCatalog,
      isInstock: item.isInstock,
      itemType: item.itemType,
      grossWeight: item.grossWeight,
      netWeight: item.netWeight,
      collectionLine: item.collectionLine,
      metalType: item.metalType,
      metalPurity: item.metalPurity,
      imageUrl: item.imageUrl,
    }));

    return NextResponse.json({
      data: catalog,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/catalog error:", error);
    return NextResponse.json(
      { error: "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}