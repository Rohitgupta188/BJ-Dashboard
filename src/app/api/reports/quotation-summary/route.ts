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
    tabName: `${day} ${month} ${year}`,
  };
}

// Sanitize worksheet name (max 31 chars, no []/*?:\)
function sanitizeSheetName(name: string) {
  return name.replace(/[\[\]\/\*\?\:\\]/g, "").substring(0, 31);
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

    // Parse dates assuming Asia/Kolkata timezone
    const start = new Date(`${startDateParam}T00:00:00+05:30`);
    const end = new Date(`${endDateParam}T00:00:00+05:30`);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // Half-open interval: < startOfDay(after selected end date)
    const endNextDay = new Date(end.getTime() + 24 * 60 * 60 * 1000);

    const filter = {
      date: {
        $gte: start,
        $lt: endNextDay,
      },
    };

    const quotations = await Quotation.find(filter)
      .select("quotationNo date companyName contactName contactNumber email address totalNetWeight totalGrossWeight totalItems remarks -_id")
      .sort({ date: 1, quotationNo: 1 })
      .lean();

    if (quotations.length === 0) {
      return NextResponse.json(
        { error: "No quotations found for the selected date range." },
        { status: 404 }
      );
    }

    // Group quotations by date (Asia/Kolkata timezone)
    const byDate = new Map<string, typeof quotations>();
    const dateSummaries = new Map<string, { date: string; tab: string; net: number; gross: number; qty: number }>();

    for (const q of quotations) {
      const { formattedDate, tabName } = getKolkataDateInfo(q.date);
      
      if (!byDate.has(tabName)) {
        byDate.set(tabName, []);
        dateSummaries.set(tabName, { date: formattedDate, tab: tabName, net: 0, gross: 0, qty: 0 });
      }
      
      byDate.get(tabName)!.push(q);
      
      const summary = dateSummaries.get(tabName)!;
      summary.net += q.totalNetWeight || 0;
      summary.gross += q.totalGrossWeight || 0;
      summary.qty += q.totalItems || 0;
    }

    const workbook = new excel.Workbook();
    workbook.creator = "Dashboard";
    workbook.created = new Date();

    // 1. Create QuotationSummary tab
    const summarySheet = workbook.addWorksheet("QuotationSummary");
    summarySheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Total Net", key: "net", width: 15 },
      { header: "Total Gross", key: "gross", width: 15 },
      { header: "Total Quantity", key: "qty", width: 15 },
    ];
    
    // Formatting header
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    summarySheet.views = [{ state: "frozen", ySplit: 1 }];

    let totalNetAll = 0;
    let totalGrossAll = 0;
    let totalQtyAll = 0;

    for (const summary of dateSummaries.values()) {
      summarySheet.addRow({
        date: summary.date,
        net: Number(summary.net.toFixed(3)),
        gross: Number(summary.gross.toFixed(3)),
        qty: summary.qty,
      });
      totalNetAll += summary.net;
      totalGrossAll += summary.gross;
      totalQtyAll += summary.qty;
    }

    // Add a final Total row on the summary sheet
    const summaryTotalRow = summarySheet.addRow({
      date: "GRAND TOTAL",
      net: Number(totalNetAll.toFixed(3)),
      gross: Number(totalGrossAll.toFixed(3)),
      qty: totalQtyAll,
    });
    summaryTotalRow.font = { bold: true };

    summarySheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle" };
      });
    });


    // 2. Create one tab per date
    for (const [tabName, qs] of byDate.entries()) {
      const sheet = workbook.addWorksheet(sanitizeSheetName(tabName));
      const summary = dateSummaries.get(tabName)!;

      // In the screenshot, Quotation Remark is the last data column.
      // The Totals (Net, Gross, Qty) are shown on Row 1 (headers) and Row 2 (values) 
      // off to the right side (columns L, M, N).
      
      sheet.columns = [
        { header: "Quotation No.", key: "quotationNo", width: 15 },
        { header: "Quotation Date", key: "date", width: 15 },
        { header: "Customer Name", key: "customerName", width: 20 },
        { header: "Contact No", key: "contactNo", width: 15 },
        { header: "Email", key: "email", width: 25 },
        { header: "Phone", key: "phone", width: 15 },
        { header: "Address", key: "address", width: 30 },
        { header: "Net Weight", key: "netWeight", width: 12 },
        { header: "Gross Weight", key: "grossWeight", width: 12 },
        { header: "Quantity", key: "qty", width: 10 },
        { header: "Quotation Remark", key: "remark", width: 40 },
        
        // Blank spacer column (optional but good for visual separation)
        { header: "", key: "spacer", width: 3 },
        
        // Top-right totals
        { header: "Total Net", key: "totalNet", width: 12 },
        { header: "Total Gross", key: "totalGross", width: 12 },
        { header: "Total Quantity", key: "totalQty", width: 12 },
      ];

      // Format header row
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      // Insert all quotation rows
      qs.forEach((q, idx) => {
        const rowData: Record<string, string | number> = {
          quotationNo: q.quotationNo,
          date: summary.date, // DD-MM-YYYY format
          customerName: q.companyName || q.contactName,
          contactNo: q.contactNumber,
          email: q.email || "0",
          phone: "0", // Fallback to 0 per screenshot style
          address: q.address,
          netWeight: Number((q.totalNetWeight || 0).toFixed(3)),
          grossWeight: Number((q.totalGrossWeight || 0).toFixed(3)),
          qty: q.totalItems || 0,
          remark: q.remarks || "",
        };

        // If this is the very first row, also populate the total columns on the right
        if (idx === 0) {
          rowData.totalNet = Number(summary.net.toFixed(3));
          rowData.totalGross = Number(summary.gross.toFixed(3));
          rowData.totalQty = summary.qty;
        }

        sheet.addRow(rowData);
      });

      // Apply borders and formatting
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        // Enable text wrapping for address and remark
        const addressCell = row.getCell("address");
        const remarkCell = row.getCell("remark");
        if (addressCell) addressCell.alignment = { wrapText: true, vertical: "middle" };
        if (remarkCell) remarkCell.alignment = { wrapText: true, vertical: "middle" };

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          // Skip borders for spacer column (col 12) and empty total cells
          if (colNumber === 12) return;
          if (colNumber > 12 && rowNumber > 2) return;

          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          if (!cell.alignment) {
            cell.alignment = { vertical: "middle" };
          }
        });
      });

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: qs.length > 0 ? qs.length + 1 : 1, column: 11 },
      };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    
    // Formatting filename safely
    const startStr = getKolkataDateInfo(start).formattedDate;
    const endStr = getKolkataDateInfo(end).formattedDate;
    const filename = `QuotationSummary_${startStr}_to_${endStr}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Failed to generate Quotation Summary report:", error);
    return NextResponse.json(
      { error: "An error occurred while generating the report." },
      { status: 500 }
    );
  }
});
