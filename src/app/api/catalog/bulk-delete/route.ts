import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

export const POST = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const body = await req.json();
    const { skus } = body;

    const MAX_BULK_DELETE = 500;

    if (!Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ error: "Missing or invalid 'skus' array." }, { status: 400 });
    }

    if (skus.length > MAX_BULK_DELETE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK_DELETE} products per request allowed.` },
        { status: 400 }
      );
    }

    const result = await Catalog.deleteMany({ sku: { $in: skus } });

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  });
}, { requireRole: "admin" });
