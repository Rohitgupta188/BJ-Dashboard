import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { checkPublicCatalogRateLimit } from "@/lib/rate-limit";
import { handleRoute } from "@/lib/api-response";

function parsePositiveInt(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PUBLIC_PROJECTION =
  "sku designNumber rfid imageName imageUrl itemStatus isCatalog isInstock " +
  "itemType grossWeight netWeight stoneWeight collectionLine metalType metalPurity updatedAt -_id";

function withCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}


export function OPTIONS(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous";

  const allowed = await checkPublicCatalogRateLimit(ip);
  if (!allowed) {
    return withCors(
      NextResponse.json(
        { success: false, error: "Too many requests. Please slow down." },
        { status: 429 }
      )
    );
  }

  return withCors(
    await handleRoute(async () => {
      await connectToDatabase();

      const { searchParams } = new URL(request.url);

      const rawPage = searchParams.get("page");
      const rawLimit = searchParams.get("limit");

      const parsedPage = parsePositiveInt(rawPage);
      const parsedLimit = parsePositiveInt(rawLimit);

      if (rawPage !== null && parsedPage === null) {
        return NextResponse.json(
          { success: false, error: "Invalid 'page' parameter. Must be a positive integer." },
          { status: 400 }
        );
      }

      if (rawLimit !== null && parsedLimit === null) {
        return NextResponse.json(
          { success: false, error: "Invalid 'limit' parameter. Must be a positive integer." },
          { status: 400 }
        );
      }

      const page = parsedPage ?? 1;
      const limit = Math.min(100, parsedLimit ?? 100);
      const skip = (page - 1) * limit;

      const [items, total] = await Promise.all([
        Catalog.find({})
          .select(PUBLIC_PROJECTION)
          .sort({ sku: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Catalog.countDocuments({}),
      ]);

      const totalPages = Math.ceil(total / limit);

      return NextResponse.json({
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        generatedAt: new Date().toISOString(),
      });
    })
  );
}

function methodNotAllowed(): NextResponse {
  return withCors(
    NextResponse.json(
      { success: false, error: "Method not allowed. This endpoint is read-only." },
      {
        status: 405,
        headers: { Allow: "GET, OPTIONS" },
      }
    )
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
