import { CatalogueItem } from "@/components/dashboard/catalogue-view";

// Load jsPDF from CDN dynamically (deduplicated loading)
async function loadJsPDF(): Promise<any> {
  if (typeof window === "undefined") return null;

  if ((window as any).jspdf?.jsPDF) {
    return (window as any).jspdf.jsPDF;
  }

  return new Promise((resolve, reject) => {
    // Prevent duplicate <script> tags
    const existing = document.querySelector('script[src*="jspdf"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if ((window as any).jspdf?.jsPDF) resolve((window as any).jspdf.jsPDF);
        else reject(new Error("jsPDF script loaded but global not found."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => {
      if ((window as any).jspdf?.jsPDF) {
        resolve((window as any).jspdf.jsPDF);
      } else {
        reject(new Error("jsPDF loaded but global object was not found."));
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load jsPDF from CDN."));
    };
    document.head.appendChild(script);
  });
}

/**
 * Detect the image format from a base64 Data URL so jsPDF gets the right hint.
 */
function detectImageFormat(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG"; // safe default
}

/**
 * Convert an image URL to a base64 Data URL.
 * Routes through /api/image-proxy to avoid CORS issues with external hosts.
 */
async function getImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error loading image via proxy:", error);
    return null;
  }
}

// Helper to draw a bordered table manually on the PDF document
function drawPDFTable(
  doc: any,
  headers: string[],
  rows: string[][],
  x: number,
  y: number,
  colWidths: number[],
  rowHeight: number = 7
) {
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  // Draw header background
  doc.setFillColor(230, 230, 230); // Gray background
  doc.rect(x, y, tableWidth, rowHeight, "F");

  // Draw cell outlines and text
  doc.setDrawColor(0, 0, 0); // Black lines
  doc.setLineWidth(0.25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  let currentX = x;
  headers.forEach((header, i) => {
    doc.rect(currentX, y, colWidths[i], rowHeight);
    doc.text(header, currentX + colWidths[i] / 2, y + rowHeight / 2 + 2.5, { align: "center" });
    currentX += colWidths[i];
  });

  // Draw rows
  doc.setFont("helvetica", "normal");
  rows.forEach((row, rowIndex) => {
    const currentY = y + (rowIndex + 1) * rowHeight;
    currentX = x;
    row.forEach((cell, cellIndex) => {
      doc.rect(currentX, currentY, colWidths[cellIndex], rowHeight);
      doc.text(cell, currentX + colWidths[cellIndex] / 2, currentY + rowHeight / 2 + 2.5, { align: "center" });
      currentX += colWidths[cellIndex];
    });
  });
}

export async function generateCatalogPDF(cart: CatalogueItem[]): Promise<void> {
  if (cart.length === 0) return;

  const JsPDFClass = await loadJsPDF();
  if (!JsPDFClass) {
    throw new Error("jsPDF could not be loaded. Make sure you are in a browser environment.");
  }

  const doc = new JsPDFClass({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Fetch all images in parallel
  const imageUrls = cart.map((item) => item.imageUrl);
  const base64Images = await Promise.all(imageUrls.map((url) => getImageDataUrl(url)));

  // Setup dimensions
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const colWidth = 85;
  const colGap = 10;
  const startY = 35; // margin under header

  let currentPage = 1;
  let currentY = startY;

  // Render Header function
  const drawHeader = () => {
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.setTextColor(197, 160, 89); // Gold color #c5a059
    doc.text("BRAHAMMAND JEWELS", pageWidth / 2, 20, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("EXECUTIVE QUOTATION CATALOG", pageWidth / 2, 25, { align: "center", charSpace: 3 });

    // Gold line separator
    doc.setDrawColor(197, 160, 89);
    doc.setLineWidth(0.5);
    doc.line(margin, 28, pageWidth - margin, 28);
  };

  // Draw Page 1 header
  drawHeader();

  // Process items in a 2-column grid
  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    const base64 = base64Images[i];

    // Determine row and column indexes
    const pageIndex = i % 4; // 4 items max per page
    const colIdx = pageIndex % 2;
    const rowIdx = Math.floor(pageIndex / 2);

    // If we exceed 4 items on the current page, create a new page
    if (i > 0 && pageIndex === 0) {
      doc.addPage();
      currentPage++;
      drawHeader();
      currentY = startY;
    }

    // Coordinates for this item block
    const x = margin + colIdx * (colWidth + colGap);
    const y = startY + rowIdx * 82; // 82mm block height

    // 1. Draw Image outer box (Solid black border)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, y, colWidth, 58);

    if (base64) {
      try {
        const format = detectImageFormat(base64);
        doc.addImage(base64, format, x + 2, y + 2, colWidth - 4, 54);
      } catch (err) {
        console.error("Failed to add image to PDF:", err);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("[Image Unavailable]", x + colWidth / 2, y + 30, { align: "center" });
        doc.text(item.designNumber, x + colWidth / 2, y + 38, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("[No Image]", x + colWidth / 2, y + 30, { align: "center" });
      doc.text(item.designNumber, x + colWidth / 2, y + 38, { align: "center" });
    }

    // Reset text color before drawing the table
    doc.setTextColor(0, 0, 0);

    // 2. Draw specifications table below the image
    const headers = ["Sr", "Design No", "Gross Wt.", "Net Wt.", "KT", "Size"];
    const netWeight = item.netWeight !== undefined ? item.netWeight : item.grossWeight;
    const purity = item.metalPurity ? item.metalPurity.replace(/\s*kt\s*/gi, "") : "9";
    
    const rows = [
      [
        (i + 1).toString(),
        item.designNumber,
        item.grossWeight.toFixed(3),
        netWeight.toFixed(3),
        purity,
        "0"
      ]
    ];
    
    // Column widths summing to 85mm
    const widths = [8, 30, 16, 16, 8, 7];
    drawPDFTable(doc, headers, rows, x, y + 60, widths, 6);
  }

  // Draw Summary Table at the end
  interface GroupedItem {
    itemType: string;
    qty: number;
    grossWeight: number;
    netWeight: number;
  }

  const groupsMap = new Map<string, GroupedItem>();
  cart.forEach((item) => {
    const type = item.itemType || "Jewelry Item";
    const net = item.netWeight !== undefined ? item.netWeight : item.grossWeight;
    if (!groupsMap.has(type)) {
      groupsMap.set(type, {
        itemType: type,
        qty: 1,
        grossWeight: item.grossWeight,
        netWeight: net,
      });
    } else {
      const existing = groupsMap.get(type)!;
      existing.qty += 1;
      existing.grossWeight += item.grossWeight;
      existing.netWeight += net;
    }
  });

  const groups = Array.from(groupsMap.values());
  const totalQty = cart.length;
  const totalGrossWeight = cart.reduce((sum, item) => sum + (item.grossWeight || 0), 0);
  const totalNetWeight = cart.reduce((sum, item) => sum + (item.netWeight !== undefined ? item.netWeight : item.grossWeight || 0), 0);

  // Determine where to draw the summary table
  // Calculate if the summary table fits on the last page.
  // Summary table height: header (8mm) + rows (groups.length * 8mm) + total row (8mm) + title (10mm) = ~26mm + (groups.length * 8mm)
  const summaryHeight = 26 + groups.length * 8;
  const remainingItemsCount = cart.length % 4;
  
  // Y coordinate where the last item block ended on the last page
  let endY = startY;
  if (remainingItemsCount > 0) {
    const lastRowIdx = Math.floor((remainingItemsCount - 1) / 2);
    endY = startY + lastRowIdx * 82 + 75; // bottom of the last item box + table
  } else if (cart.length > 0) {
    // If it fills exactly a page (i.e. 4, 8, 12 items), it is at the bottom of the page
    endY = pageHeight;
  }

  const spaceAvailable = pageHeight - margin - endY;

  // Add new page if summary table doesn't fit
  if (spaceAvailable < summaryHeight) {
    doc.addPage();
    currentPage++;
    drawHeader();
    currentY = startY;
  } else {
    currentY = endY + 12; // 12mm space below the grid
  }

  // Draw Summary Title
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(197, 160, 89);
  doc.text("QUOTATION SUMMARY", margin, currentY);
  
  // Decorative underline under title
  doc.setDrawColor(197, 160, 89);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 1.5, margin + 46, currentY + 1.5);

  // Table Columns Setup (Total width 180mm)
  const summaryHeaders = ["Sr.", "Item Type", "Qty", "Gross Wt", "Net Wt"];
  const summaryWidths = [12, 78, 20, 35, 35];
  
  const summaryRows = groups.map((g, idx) => [
    (idx + 1).toString(),
    g.itemType,
    g.qty.toString(),
    g.grossWeight.toFixed(3),
    g.netWeight.toFixed(3)
  ]);

  // Draw table headers & body
  drawPDFTable(doc, summaryHeaders, summaryRows, margin, currentY + 4, summaryWidths, 7);

  // Draw Total row (bottom line)
  const finalY = currentY + 4 + (groups.length + 1) * 7;
  doc.setFillColor(230, 230, 230);
  doc.rect(margin, finalY, summaryWidths[0] + summaryWidths[1], 7, "F");
  
  // Cells borders
  doc.setDrawColor(0, 0, 0);
  doc.rect(margin, finalY, summaryWidths[0] + summaryWidths[1], 7);
  doc.rect(margin + summaryWidths[0] + summaryWidths[1], finalY, summaryWidths[2], 7);
  doc.rect(margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2], finalY, summaryWidths[3], 7);
  doc.rect(margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] + summaryWidths[3], finalY, summaryWidths[4], 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total", margin + (summaryWidths[0] + summaryWidths[1]) / 2, finalY + 4.5, { align: "center" });
  doc.text(totalQty.toString(), margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] / 2, finalY + 4.5, { align: "center" });
  doc.text(`Approx. ${totalGrossWeight.toFixed(3)} gms`, margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] + summaryWidths[3] / 2, finalY + 4.5, { align: "center" });
  doc.text(`Approx. ${totalNetWeight.toFixed(3)} gms`, margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] + summaryWidths[3] + summaryWidths[4] / 2, finalY + 4.5, { align: "center" });

  // Save the document
  const fileName = `Quotation_BJ_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
