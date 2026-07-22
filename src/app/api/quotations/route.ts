import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Quotation from "@/models/Quotation";
import { withAuth } from "@/lib/auth";
import { handleRoute } from "@/lib/api-response";

function generateQuotationNo(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BJ-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export const GET = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const page     = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
    const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10));
    const search   = searchParams.get("search")?.trim() ?? "";

    const filter = search
      ? {
          $or: [
            { quotationNo:  { $regex: search, $options: "i" } },
            { companyName:  { $regex: search, $options: "i" } },
            { contactName:  { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [quotations, total] = await Promise.all([
      Quotation.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Quotation.countDocuments(filter),
    ]);

    return NextResponse.json({ quotations, total, page, pageSize });
  });
});

export const POST = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const body = await req.json();

    let quotationNo = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateQuotationNo();
      const exists = await Quotation.exists({ quotationNo: candidate });
      if (!exists) { quotationNo = candidate; break; }
    }
    if (!quotationNo) {
      return NextResponse.json({ error: "Could not generate unique quotation number." }, { status: 500 });
    }

    const lineItems = (body.lineItems ?? []).map((li: any) => ({
      sku:          li.sku,
      designNumber: li.designNumber,
      itemType:     li.itemType ?? "",
      grossWeight:  Number(li.grossWeight ?? 0),
      netWeight:    Number(li.netWeight   ?? 0),
      stoneWeight:  Number(li.stoneWeight ?? 0),
      metalPurity:  li.metalPurity ?? "",
      metalType:    li.metalType   ?? "",
      imageUrl:     li.imageUrl    ?? "",
      qty:          Number(li.qty  ?? 1),
      remarks:      li.remarks     ?? "",
    }));

    const totalGrossWeight = lineItems.reduce((s: number, li: any) => s + li.grossWeight, 0);
    const totalNetWeight   = lineItems.reduce((s: number, li: any) => s + li.netWeight,   0);

    const quotation = await Quotation.create({
      quotationNo,
      date:          body.date ? new Date(body.date) : new Date(),
      customerId:    body.customerId    ?? undefined,
      companyName:   body.companyName,
      contactName:   body.contactName,
      email:         body.email         ?? "",
      address:       body.address,
      contactNumber: body.contactNumber,
      remarks:       body.remarks       ?? "",
      lineItems,
      totalGrossWeight,
      totalNetWeight,
      totalItems: lineItems.length,
    });

    return NextResponse.json({ quotation, quotationNo }, { status: 201 });
  });
});
