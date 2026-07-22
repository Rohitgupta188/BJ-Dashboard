import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Customer from "@/models/Customer";
import { customerSchema } from "@/lib/validation/customer.schema";
import { z } from 'zod'

// GET /api/customers?search=ayansh&page=1&pageSize=10
export async function GET(req: NextRequest) {
  try {
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
  } catch (error) {
    console.error("GET /api/customers failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers." },
      { status: 500 }
    );
  }
}

// POST /api/customers
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          message: "Validation failed",
          errors: z.treeifyError(parsed.error),
        },
        { status: 400 }
      );
    }

    const { name, email, contactName, phone, address } = parsed.data;

    if (!name || !contactName || !phone || !address) {
      return NextResponse.json(
        { error: "Name, contact name, phone, and address are required." },
        { status: 400 }
      );
    }

    const customer = await Customer.create({
      name,
      email,
      contactName,
      phone,
      address,
    });

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers failed:", error);
    return NextResponse.json(
      { error: "Failed to create customer." },
      { status: 500 }
    );
  }
}