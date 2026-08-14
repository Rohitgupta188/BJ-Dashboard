import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

const MAX_SEARCH_LENGTH = 20;

const isNonEmpty = (val?: string | null): val is string =>
  Boolean(val && val.trim().length > 0);

const escapeRegex = (text: string): string =>
  text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");

export const GET = withAuth(async (request: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);

    // Bounds checking on pagination
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));

    const search = searchParams.get("search")?.trim();
    const itemStatus = searchParams.get("itemStatus")?.trim();
    const isCatalog = searchParams.get("isCatalog")?.trim();
    const isInstock = searchParams.get("isInstock")?.trim();
    const metalPurity = searchParams.get("metalPurity")?.trim();
    const metalType = searchParams.get("metalType")?.trim();
    const itemType = searchParams.get("itemType")?.trim();
    const collectionLine = searchParams.get("collectionLine")?.trim();
    const requireImage = searchParams.get("requireImage")?.trim();

    if (search && search.length > MAX_SEARCH_LENGTH) {
      return NextResponse.json(
        { error: `Search parameter exceeds maximum length of ${MAX_SEARCH_LENGTH} characters.` },
        { status: 400 }
      );
    }

    // Parameters already extracted above.

    const filter: Record<string, unknown> = {};

    // DRY helper for optional string fields
    const addIfPresent = (key: string, value?: string | null) => {
      if (isNonEmpty(value)) {
        filter[key] = value;
      }
    };

    if (requireImage === "true") {
      // Exclude null, missing, and empty-string imageUrls
      filter.imageUrl = { $exists: true, $nin: [null, ""] };
    }

    // Anchored prefix regex search
    if (isNonEmpty(search)) {
      filter.designNumber = { $regex: `^${escapeRegex(search)}`, $options: "i" };
    }

    addIfPresent("itemStatus", itemStatus);
    addIfPresent("metalPurity", metalPurity);
    addIfPresent("metalType", metalType);
    addIfPresent("itemType", itemType);
    addIfPresent("collectionLine", collectionLine);

    // Explicit boolean handling
    if (isCatalog === "true") filter.isCatalog = true;
    if (isCatalog === "false") filter.isCatalog = false;

    if (isInstock === "true") filter.isInstock = true;
    if (isInstock === "false") filter.isInstock = false;

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Catalog.find(filter)
        .select(
          "designNumber rfid sku itemStatus isCatalog isInstock itemType grossWeight netWeight collectionLine metalType metalPurity imageUrl -_id"
        )
        .sort({ designNumber: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Catalog.countDocuments(filter),
    ]);

    return NextResponse.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
});