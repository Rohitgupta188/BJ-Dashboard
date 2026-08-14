import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

export const GET = withAuth(async (request: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const itemType = searchParams.get("itemType")?.trim();
    const collectionLine = searchParams.get("collectionLine")?.trim();
    const metalPurity = searchParams.get("metalPurity")?.trim();
    const metalType = searchParams.get("metalType")?.trim();

    const isNonEmpty = (val?: string | null): val is string => Boolean(val && val.trim().length > 0);

    const getFilter = (excludeField: string) => {
      const filter: Record<string, any> = {};
      if (isNonEmpty(itemType) && excludeField !== "itemType") filter.itemType = itemType;
      if (isNonEmpty(collectionLine) && excludeField !== "collectionLine") filter.collectionLine = collectionLine;
      if (isNonEmpty(metalPurity) && excludeField !== "metalPurity") filter.metalPurity = metalPurity;
      if (isNonEmpty(metalType) && excludeField !== "metalType") filter.metalType = metalType;
      return filter;
    };

    const [result] = await Catalog.aggregate([
      {
        $facet: {
          itemTypes: [
            { $match: getFilter("itemType") },
            { $group: { _id: "$itemType" } },
          ],
          collectionLines: [
            { $match: getFilter("collectionLine") },
            { $group: { _id: "$collectionLine" } },
          ],
          metalPurities: [
            { $match: getFilter("metalPurity") },
            { $group: { _id: "$metalPurity" } },
          ],
          metalTypes: [
            { $match: getFilter("metalType") },
            { $group: { _id: "$metalType" } },
          ],
        },
      },
    ]).allowDiskUse(true);

    if (!result) {
      return NextResponse.json(
        { data: { itemTypes: [], collectionLines: [], metalPurities: [], metalTypes: [] } },
        { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    const extractAndSort = (arr: { _id: string }[]) =>
      arr
        .map((i) => i._id)
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)));

    return NextResponse.json(
      {
        data: {
          itemTypes: extractAndSort(result.itemTypes || []),
          collectionLines: extractAndSort(result.collectionLines || []),
          metalPurities: extractAndSort(result.metalPurities || []),
          metalTypes: extractAndSort(result.metalTypes || []),
        }
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  });
});
