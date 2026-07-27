import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Quotation from "@/models/Quotation";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

export const POST = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const body = await req.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Missing or invalid 'ids' array." }, { status: 400 });
    }

    const result = await Quotation.deleteMany({ _id: { $in: ids } });

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  });
});
