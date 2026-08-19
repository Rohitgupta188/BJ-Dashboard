import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Catalog from "@/models/Catalog";
import { withAuth } from "@/lib/auth";
import excel from "exceljs";

export const GET = withAuth(async (request: NextRequest) => {
  try {
    await connectToDatabase();

    // Query for all catalog items where imageUrl is missing, null, or empty
    const filter = {
      $or: [
        { imageUrl: { $exists: false } },
        { imageUrl: null },
        { imageUrl: "" }
      ]
    };

    // Projection to fetch only required fields to save memory
    const items = await Catalog.find(filter)
      .select("rfid designNumber itemType imageName -_id")
      .lean();

    const workbook = new excel.Workbook();
    workbook.creator = "Dashboard";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("PendingImages");

    // Add headers
    worksheet.columns = [
      { header: "RFID Tag", key: "rfid", width: 20 },
      { header: "Design No.", key: "designNumber", width: 20 },
      { header: "Item Type", key: "itemType", width: 25 },
      { header: "Item Category", key: "itemCategory", width: 20 },
      { header: "Image Name", key: "imageName", width: 35 },
    ];

    // Format header row (bold, borders, frozen)
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    // Add rows
    items.forEach((item) => {
      worksheet.addRow({
        rfid: item.rfid,
        designNumber: item.designNumber,
        itemType: item.itemType,
        itemCategory: "", // Left blank per requirements
        imageName: item.imageName,
      });
    });

    // Apply borders to all data rows
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { vertical: "middle" };
        });
      }
    });

    // Enable auto-filter
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: items.length > 0 ? items.length + 1 : 1, column: 5 },
    };

    // Generate Excel buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return the response as a downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="PendingImages.xlsx"',
      },
    });
  } catch (error: unknown) {
    console.error("Failed to generate Pending Images report:", error);
    return NextResponse.json(
      { error: "An error occurred while generating the report." },
      { status: 500 }
    );
  }
});
