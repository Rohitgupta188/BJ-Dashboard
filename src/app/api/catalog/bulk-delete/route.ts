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

    // Soft-delete: set deleted=true + bump updatedAt so the mobile delta
    // query discovers these records and removes them from the local SQLite DB.
    // updateMany bypasses Mongoose timestamps middleware — bump updatedAt explicitly.
    const now = new Date();
    const result = await Catalog.updateMany(
      { sku: { $in: skus } },
      { $set: { deleted: true, deletedAt: now, updatedAt: now } }
    );

    return NextResponse.json({ success: true, deletedCount: result.modifiedCount });
  });
}, { requireRole: "admin" });
