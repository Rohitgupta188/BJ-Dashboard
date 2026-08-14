import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { withAuth, type AuthenticatedRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;

  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  try {
    await connectToDatabase();

    const decoded = decodeURIComponent(sku);
    const escaped = decoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const item = await Catalog.findOne({
      $or: [
        { sku: { $regex: `^${escaped}$`, $options: 'i' } },
        { designNumber: { $regex: `^${escaped}$`, $options: 'i' } },
        { rfid: { $regex: `^${escaped}$`, $options: 'i' } },
      ],
    }).lean();

    if (!item) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ data: item });
  } catch (err) {
    console.error("[GET /api/catalog/[sku]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export const DELETE = withAuth(async (
  _request: NextRequest,
  context: AuthenticatedRequest & { params: Promise<{ sku: string }> }
) => {
  try {
    const { sku } = await context.params;
    if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });

    await connectToDatabase();
    const result = await Catalog.deleteOne({ sku: decodeURIComponent(sku) });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/catalog/[sku]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { requireRole: "admin" });

// Fields that admin is allowed to update via PATCH.
// Whitelist prevents accidental/malicious writes to system fields
// like imageMd5, storagePath, storageProvider, _id, etc.
const PATCHABLE_FIELDS = new Set([
  "itemStatus", "itemType", "isCatalog", "isInstock",
  "grossWeight", "netWeight", "stoneWeight",
  "collectionLine", "metalType", "metalPurity",
  "imageName", "imageUrl",
]);

export const PATCH = withAuth(async (
  request: NextRequest,
  context: AuthenticatedRequest & { params: Promise<{ sku: string }> }
) => {
  try {
    const { sku } = await context.params;
    if (!sku) return NextResponse.json({ error: "sku required" }, { status: 400 });

    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    // Strip any field not on the whitelist
    const safeUpdate: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(body)) {
      if (PATCHABLE_FIELDS.has(key)) safeUpdate[key] = val;
    }
    if (Object.keys(safeUpdate).length === 0) {
      return NextResponse.json({ error: "No patchable fields provided." }, { status: 400 });
    }

    await connectToDatabase();

    const updated = await Catalog.findOneAndUpdate(
      { sku: decodeURIComponent(sku) },
      { $set: safeUpdate },
      { returnDocument: "after" }
    );

    if (!updated) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/catalog/[sku]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { requireRole: "admin" });
