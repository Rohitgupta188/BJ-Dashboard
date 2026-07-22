import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Customer from "@/models/Customer";
import { customerSchema } from "@/lib/validation/customer.schema";
import { z } from "zod";

// TypeScript: In Next.js 15, params is a Promise
type Params = { params: Promise<{ id: string }> };

// PUT /api/customers/:id
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        await connectToDatabase();

        // 1. Await the params promise to extract the id safely
        const { id } = await params;

        const body = await req.json();
        const parsed = customerSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Validation failed",
                    errors: z.treeifyError(parsed.error),
                },
                { status: 400 }
            );
        }

        // 2. Use the unwrapped id here
        const customer = await Customer.findByIdAndUpdate(
            id,
            { $set: parsed.data },
            { returnDocument: "after", runValidators: true }
        );

        if (!customer) {
            return NextResponse.json({ error: "Customer not found." }, { status: 404 });
        }

        return NextResponse.json({ customer });
    } catch (error) {
        console.error("PUT /api/customers/[id] failed:", error);
        return NextResponse.json(
            { error: "Failed to update customer." },
            { status: 500 }
        );
    }
}

// DELETE /api/customers/:id
export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        await connectToDatabase();

        // 1. Await the params promise here as well
        const { id } = await params;

        // 2. Use the unwrapped id here
        const customer = await Customer.findByIdAndDelete(id);

        if (!customer) {
            return NextResponse.json({ error: "Customer not found." }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE /api/customers/[id] failed:", error);
        return NextResponse.json(
            { error: "Failed to delete customer." },
            { status: 500 }
        );
    }
}