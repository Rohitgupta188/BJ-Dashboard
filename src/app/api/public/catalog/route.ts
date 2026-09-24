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

function parseISODate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function withCors(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

const PUBLIC_PROJECTION =
  "sku designNumber rfid imageName imageUrl itemStatus isCatalog isInstock " +
  "itemType grossWeight netWeight stoneWeight collectionLine metalType metalPurity " +
  "deleted deletedAt updatedAt -_id";

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
      const mode     = searchParams.get("mode");   // "full" | "delta" | null
      const rawLimit = searchParams.get("limit");

      const parsedLimit = parsePositiveInt(rawLimit);
      if (rawLimit !== null && parsedLimit === null) {
        return badRequest("Invalid 'limit' parameter. Must be a positive integer.");
      }
      const limit = Math.min(500, parsedLimit ?? 100);

      if (mode === null || mode === "full") {
        return handleFullSync(searchParams, limit);
      }
      if (mode === "delta") {
        return handleDeltaSync(searchParams, limit);
      }

      return badRequest("Invalid 'mode' parameter. Must be 'full' or 'delta'.");
    })
  );
}

async function handleFullSync(
  searchParams: URLSearchParams,
  limit: number,
): Promise<NextResponse> {
  const rawPage         = searchParams.get("page");
  const afterSku        = searchParams.get("afterSku");
  const rawSyncBoundary = searchParams.get("syncBoundary");

  let syncBoundary: Date;
  if (rawSyncBoundary !== null) {
    const parsed = parseISODate(rawSyncBoundary);
    if (!parsed) {
      return badRequest("Invalid 'syncBoundary': must be a valid ISO 8601 timestamp.");
    }
    syncBoundary = parsed;
  } else {
    syncBoundary = new Date();
  }
  const filter: Record<string, unknown> = afterSku
    ? { sku: { $gt: afterSku } }
    : {};

  const items = await Catalog.find(filter)
    .select(PUBLIC_PROJECTION)
    .sort({ sku: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = items.length > limit;
  const data    = hasMore ? items.slice(0, limit) : items;

  const lastItem   = data.at(-1);
  const nextCursor = lastItem ? { sku: (lastItem as { sku: string }).sku } : null;

  return NextResponse.json({
    success: true,
    mode: "full",
    data,
    pagination: {
      limit,
      nextCursor,
      hasMore,
    },
    syncBoundary: syncBoundary.toISOString(),
    generatedAt: new Date().toISOString(),
  });
}

async function handleDeltaSync(
  searchParams: URLSearchParams,
  limit: number,
): Promise<NextResponse> {
  const rawUpdatedSince   = searchParams.get("updatedSince");
  const rawSyncBoundary   = searchParams.get("syncBoundary");
  const rawAfterUpdatedAt = searchParams.get("afterUpdatedAt");
  const afterSku          = searchParams.get("afterSku");

  if (!rawUpdatedSince) {
    return badRequest("Delta sync requires 'updatedSince' (ISO 8601 timestamp).");
  }
  const updatedSince = parseISODate(rawUpdatedSince);
  if (!updatedSince) {
    return badRequest("Invalid 'updatedSince': must be a valid ISO 8601 timestamp.");
  }

  let syncBoundary: Date;
  if (rawSyncBoundary !== null) {
    const parsed = parseISODate(rawSyncBoundary);
    if (!parsed) {
      return badRequest("Invalid 'syncBoundary': must be a valid ISO 8601 timestamp.");
    }
    syncBoundary = parsed;
  } else {
    syncBoundary = new Date();
  }

  if (syncBoundary < updatedSince) {
    return badRequest(
      "'syncBoundary' cannot be earlier than 'updatedSince'. " +
      "Ensure you are echoing the syncBoundary received from the first delta response."
    );
  }

  const afterUpdatedAt = parseISODate(rawAfterUpdatedAt);
  if (rawAfterUpdatedAt !== null && afterUpdatedAt === null) {
    return badRequest("Invalid 'afterUpdatedAt': must be a valid ISO 8601 timestamp.");
  }
  if ((afterUpdatedAt !== null) !== (afterSku !== null)) {
    return badRequest(
      "Cursor params 'afterUpdatedAt' and 'afterSku' must be provided together."
    );
  }

  if (afterUpdatedAt) {
    if (afterUpdatedAt > syncBoundary) {
      return badRequest("'afterUpdatedAt' cannot be later than 'syncBoundary'.");
    }
    if (afterUpdatedAt < updatedSince) {
      return badRequest("'afterUpdatedAt' cannot be earlier than 'updatedSince'.");
    }
  }

  const windowClause = { updatedAt: { $gt: updatedSince, $lte: syncBoundary } };

  let filter: Record<string, unknown>;

  if (afterUpdatedAt && afterSku) {
    filter = {
      $and: [
        windowClause,
        {
          $or: [
            { updatedAt: { $gt: afterUpdatedAt } },
            {
              updatedAt: afterUpdatedAt,
              sku: { $gt: afterSku },
            },
          ],
        },
      ],
    };
  } else {
    filter = windowClause;
  }

  const items = await Catalog.find(filter)
    .select(PUBLIC_PROJECTION)
    .sort({ updatedAt: 1, sku: 1 })
    .limit(limit + 1)
    .lean();

  const hasMore = items.length > limit;
  const data    = hasMore ? items.slice(0, limit) : items;

  const lastItem = data.at(-1) as
    | { sku: string; updatedAt: Date | string }
    | undefined;

  const nextCursor = lastItem
    ? {
        updatedAt: lastItem.updatedAt instanceof Date
          ? lastItem.updatedAt.toISOString()
          : lastItem.updatedAt,
        sku: lastItem.sku,
      }
    : null;

  return NextResponse.json({
    success: true,
    mode: "delta",
    data,
    pagination: {
      limit,
      nextCursor,
      hasMore,
    },
    syncBoundary: syncBoundary.toISOString(),
    generatedAt: new Date().toISOString(),
  });
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

export const POST   = methodNotAllowed;
export const PUT    = methodNotAllowed;
export const PATCH  = methodNotAllowed;
export const DELETE = methodNotAllowed;
