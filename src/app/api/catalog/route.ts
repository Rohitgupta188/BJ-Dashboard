import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog, { type ICatalog } from "@/models/Catalog";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

export const GET = withAuth(async (request: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const search = searchParams.get("search")?.trim();
    const itemStatus = searchParams.get("itemStatus")?.trim();
    const isCatalog = searchParams.get("isCatalog")?.trim();
    const isInstock = searchParams.get("isInstock")?.trim();
    const metalPurity = searchParams.get("metalPurity")?.trim();
    const metalType = searchParams.get("metalType")?.trim();

    const filter: Record<string, unknown> = {
      imageUrl: { $exists: true, $ne: null },
    };

    if (search) {
      filter.$or = [
        { designNumber: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }
    
    if (itemStatus) {
      filter.itemStatus = itemStatus;
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

    const catalog = (items as unknown as ICatalog[]).map((item) => ({
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
  });
});