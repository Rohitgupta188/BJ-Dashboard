import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Customer from "@/models/Customer";
import { customerSchema } from "@/lib/validation/customer.schema";
import { objectIdSchema } from "@/lib/validation";
import { withAuth } from "@/lib/auth";
import { handleRoute, validationError, notFound, error } from "@/lib/api-response";

type Params = { params: Promise<{ id: string }> };

export const PUT = withAuth<Params>(async (req, ctx) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { id } = await ctx.params;

    const idValidation = objectIdSchema.safeParse(id);
    if (!idValidation.success) {
      return error("Invalid customer ID format", 400);
    }

    const body = await req.json();
    const parsed = customerSchema.safeParse(body);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const customer = await Customer.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { returnDocument: "after", runValidators: true }
    );

    if (!customer) {
      return notFound("Customer not found");
    }

    return NextResponse.json({ customer });
  });
});

export const DELETE = withAuth<Params>(async (_req, ctx) => {
  return handleRoute(async () => {
    await connectToDatabase();

    const { id } = await ctx.params;

    const idValidation = objectIdSchema.safeParse(id);
    if (!idValidation.success) {
      return error("Invalid customer ID format", 400);
    }

    const customer = await Customer.findByIdAndDelete(id);

    if (!customer) {
      return notFound("Customer not found");
    }

    return NextResponse.json({ success: true });
  });
});