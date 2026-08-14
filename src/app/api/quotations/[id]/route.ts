import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Quotation from "@/models/Quotation";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const { id } = await params;
    const quotation = await Quotation.findOne({ quotationNo: id }).lean();
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    return NextResponse.json({ quotation });
  });
});

export const PATCH = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const { id } = await params;
    const body = await req.json();

    const updateFields: any = {};
    if (body.remarks !== undefined) updateFields.remarks = body.remarks;
    if (body.isDispatched !== undefined) updateFields.isDispatched = body.isDispatched;
    if (body.lineItems !== undefined) {
      updateFields.lineItems = body.lineItems;
      updateFields.totalGrossWeight = body.lineItems.reduce((s: number, li: any) => s + (Number(li.grossWeight) || 0) * (Number(li.qty) || 1), 0);
      updateFields.totalNetWeight = body.lineItems.reduce((s: number, li: any) => s + (Number(li.netWeight) || 0) * (Number(li.qty) || 1), 0);
      updateFields.totalItems = body.lineItems.length;
    }

    const quotation = await Quotation.findOneAndUpdate(
      { quotationNo: id },
      { $set: updateFields },
      { returnDocument: "after" }
    ).lean();

    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    return NextResponse.json({ quotation });
  });
});

export const DELETE = withAuth(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  return handleRoute(async () => {
    await connectToDatabase();
    const { id } = await params;
    const quotation = await Quotation.findOneAndDelete({ quotationNo: id });
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  });
});
