import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Quotation from "@/models/Quotation";
import { withAuth } from "@/lib/auth";
import excel from "exceljs";

function getKolkataDateInfo(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  
  const day = parts.find((p) => p.type === "day")?.value || "01";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const year = parts.find((p) => p.type === "year")?.value || "1970";

  return {
    formattedDate: `${day}-${month}-${year}`,
  };
}

export const GET = withAuth(async (request: NextRequest) => {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!startDateParam || !endDateParam) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const start = new Date(`${startDateParam}T00:00:00+05:30`);
    const end = new Date(`${endDateParam}T00:00:00+05:30`);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    const endNextDay = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    const filter = {
      date: {
        $gte: start,
        $lt: endNextDay,
      },
    };

    const quotations = await Quotation.find(filter)
      .select("quotationNo date companyName contactName totalNetWeight totalGrossWeight lineItems -_id")
      .sort({ date: 1, quotationNo: 1 })
      .lean();

    if (quotations.length === 0) {
      return NextResponse.json(
        { error: "No quotations found for the selected date range." },
        { status: 404 }
      );
    }

    const workbook = new excel.Workbook();
    workbook.creator = "Dashboard";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("QuotationDetails");

    worksheet.columns = [
      { header: "Quotation No.", key: "quotationNo", width: 15 },
      { header: "Quotation Date", key: "date", width: 15 },
      { header: "Design No.", key: "designNumber", width: 20 },
      { header: "Customer Name", key: "customerName", width: 20 },
      { header: "Gross Weight", key: "grossWeight", width: 15 },
      { header: "Net Weight", key: "netWeight", width: 15 },
      { header: "Quantity", key: "qty", width: 10 },
      { header: "Metal Typ", key: "metalTyp", width: 15 },
      { header: "Metal Pur", key: "metalPur", width: 15 },
      { header: "Remark", key: "remark", width: 35 },
      { header: "Vendor", key: "vendor", width: 15 },
      { header: "Item Type", key: "itemType", width: 20 },
      { header: "Order Typ", key: "orderTyp", width: 15 },
      { header: "Total Net", key: "totalNet", width: 15 },
      { header: "Total Gross Weight", key: "totalGross", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    let totalRows = 0;

    quotations.forEach((q) => {
      const customerName = q.companyName || q.contactName;
      const formattedDate = getKolkataDateInfo(q.date).formattedDate;
      const totalNet = q.totalNetWeight || 0;
      const totalGross = q.totalGrossWeight || 0;

      q.lineItems.forEach((li: Record<string, any>, idx: number) => {
        worksheet.addRow({
          quotationNo: q.quotationNo,
          date: formattedDate,
          designNumber: li.designNumber,
          customerName: customerName,
          grossWeight: li.grossWeight ? Number(li.grossWeight.toFixed(3)) : 0,
          netWeight: li.netWeight ? Number(li.netWeight.toFixed(3)) : 0,
          qty: li.qty || 1,
          metalTyp: li.metalType || "",
          metalPur: li.metalPurity || "",
          remark: li.remarks || "",
          vendor: "", // Blank per request
          itemType: li.itemType || "",
          orderTyp: "", // Blank per request
          totalNet: idx === 0 ? Number(totalNet.toFixed(3)) : "",
          totalGross: idx === 0 ? Number(totalGross.toFixed(3)) : "",
        });
        totalRows++;
      });
    });

    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > 1) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          if (!cell.alignment) {
            cell.alignment = { vertical: "middle" };
          }
        });

        const remarkCell = row.getCell("remark");
        if (remarkCell) {
          remarkCell.alignment = { wrapText: true, vertical: "middle" };
        }
      }
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: totalRows > 0 ? totalRows + 1 : 1, column: 15 },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    
    const startStr = getKolkataDateInfo(start).formattedDate;
    const endStr = getKolkataDateInfo(end).formattedDate;
    const filename = `QuotationDetails_${startStr}_to_${endStr}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to generate Quotation Details report:", error);
    return NextResponse.json(
      { error: "An error occurred while generating the report." },
      { status: 500 }
    );
  }
});
