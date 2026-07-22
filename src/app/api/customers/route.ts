import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Customer from "@/models/Customer";
import { customerSchema } from "@/lib/validation/customer.schema";
import { withAuth } from "@/lib/auth";
import { handleRoute, validationError } from "@/lib/api-response";

export const GET = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") ?? "10", 10));

    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { contactName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phone: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    return NextResponse.json({ customers, total, page, pageSize });
  });
});

// POST /api/customers
export const POST = withAuth(async (req: NextRequest) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const body = await req.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const customer = await Customer.create(parsed.data);

    return NextResponse.json({ customer }, { status: 201 });
  });
});