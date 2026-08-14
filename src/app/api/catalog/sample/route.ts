/**
 * GET /api/catalog/sample
 *
 * Returns a pre-formatted sample .xlsx file with one example row.
 * Used by the ImportProductTab "Download Sample Excel" button.
 *
 * Generating server-side keeps ExcelJS off the client bundle entirely.
 */

import { NextResponse }      from "next/server";
import { buildSampleExcel }  from "@/lib/excel/export";

export async function GET() {
  try {
    const buffer = await buildSampleExcel();

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="BJ_Import_Sample.xlsx"',
        "Cache-Control":       "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[GET /api/catalog/sample]", err);
    return NextResponse.json({ error: "Could not generate sample file." }, { status: 500 });
  }
}
