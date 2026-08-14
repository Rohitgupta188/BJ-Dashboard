import { CatalogueItem } from "@/components/dashboard/catalogue-view";
import { jsPDF } from "jspdf";

/**
 * Detect the image format from a base64 Data URL so jsPDF gets the right hint.
 */
function detectImageFormat(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG"; // safe default
}

interface ImageData {
  base64: string;
  width: number;
  height: number;
}

/**
 * Convert an image URL to a base64 Data URL and fetch dimensions.
 */
async function getImageDataUrl(url: string): Promise<ImageData | null> {
  if (!url) return null;
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null as any);
      reader.readAsDataURL(blob);
    });
    if (!base64) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ base64, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ base64, width: 1, height: 1 });
      img.src = base64;
    });
  } catch (error) {
    console.error("Error loading image via proxy:", error);
    return null;
  }
}

// Helper to draw a bordered table manually on the PDF document
function drawPDFTable(doc: any, headers: string[], rows: string[][], x: number, y: number, colWidths: number[], rowHeight: number = 7) {
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  doc.setFillColor(230, 230, 230);
  doc.rect(x, y, tableWidth, rowHeight, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  let currentX = x;
  headers.forEach((header, i) => {
    doc.rect(currentX, y, colWidths[i], rowHeight);
    doc.text(header, currentX + colWidths[i] / 2, y + rowHeight / 2 + 2.5, { align: "center" });
    currentX += colWidths[i];
  });

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

export interface ExecutivePdfParams {
  items: CatalogueItem[];
  customer?: {
    companyName: string;
    contactName: string;
    address: string;
    quotationNo: string;
    date: string;
    logoBase64?: string | null;
    remarks?: string;
  };
}

export async function generateCatalogPDF(params: ExecutivePdfParams | CatalogueItem[]): Promise<void> {
  const isLegacy = Array.isArray(params);
  const items = isLegacy ? params : params.items;
  const customer = isLegacy ? undefined : params.customer;

  if (items.length === 0) return;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const imageUrls = items.map((item) => item.imageUrl ?? "");
  const imageResults = await Promise.all(imageUrls.map((url) => url ? getImageDataUrl(url) : Promise.resolve(null)));

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const colWidth = 85;
  const colGap = 10;
  
  let currentY = margin;

  // 1. Draw Global Header & Optional Customer Details
  doc.setFont("times", "bold");
  doc.setFontSize(24);
  doc.setTextColor(197, 160, 89);
  doc.text("BRAHAMMAND JEWELS", pageWidth / 2, currentY + 5, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("QUOTATION", pageWidth / 2, currentY + 12, { align: "center", charSpace: 3 });

  doc.setDrawColor(197, 160, 89);
  doc.setLineWidth(0.5);
  doc.line(margin, currentY + 16, pageWidth - margin, currentY + 16);
  currentY += 22;

  if (customer) {
    const tableW = pageWidth - 2 * margin;
    const infoW = tableW * 0.7;
    const logoX = margin + infoW;
    const logoW = tableW - infoW;

    const infoRows = [
      [`Customer Name: ${customer.companyName}`],
      [`Contact Name: ${customer.contactName}`],
      [`Customer Address: ${customer.address}`],
      [`Quotation: ${customer.quotationNo}`],
      [`Date: ${customer.date}`],
    ];

    if (customer.remarks) {
      infoRows.push([`Remarks: ${customer.remarks}`]);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);

    const parsedRows = infoRows.map(r => {
      const lines = doc.splitTextToSize(r[0], infoW - 6);
      return {
        text: lines,
        height: Math.max(6, lines.length * 4 + 2)
      };
    });

    const totalH = parsedRows.reduce((sum, r) => sum + r.height, 0);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, currentY, tableW, totalH);
    doc.line(logoX, currentY, logoX, currentY + totalH);

    doc.setTextColor(0, 0, 0);
    let currentYOffset = currentY;
    parsedRows.forEach((row, i) => {
      doc.text(row.text, margin + 3, currentYOffset + 4.5);
      if (i < parsedRows.length - 1) {
        doc.setLineWidth(0.1);
        doc.line(margin, currentYOffset + row.height, logoX, currentYOffset + row.height);
      }
      currentYOffset += row.height;
    });

    if (customer.logoBase64) {
      try {
        const format = detectImageFormat(customer.logoBase64);
        doc.addImage(customer.logoBase64, format, logoX + 2, currentY + 2, logoW - 4, totalH - 4);
      } catch (err) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("LOGO", logoX + logoW / 2, currentY + totalH / 2, { align: "center" });
      }
    }
    currentY += totalH + 8;
  }

  // 2. Build & Draw Quotation Summary Table
  interface GroupedItem {
    itemType: string;
    qty: number;
    grossWeight: number;
    netWeight: number;
  }

  const groupsMap = new Map<string, GroupedItem>();
  items.forEach((item) => {
    const type = item.itemType || "Jewelry Item";
    const net = item.netWeight !== undefined ? item.netWeight : item.grossWeight;
    if (!groupsMap.has(type)) {
      groupsMap.set(type, { itemType: type, qty: 1, grossWeight: item.grossWeight, netWeight: net });
    } else {
      const existing = groupsMap.get(type)!;
      existing.qty += 1;
      existing.grossWeight += item.grossWeight;
      existing.netWeight += net;
    }
  });

  const groups = Array.from(groupsMap.values());
  const totalQty = items.length;
  const totalGrossWeight = items.reduce((sum, item) => sum + (item.grossWeight || 0), 0);
  const totalNetWeight = items.reduce((sum, item) => sum + (item.netWeight !== undefined ? item.netWeight : item.grossWeight || 0), 0);

  doc.setFont("times", "bold");
  doc.setFontSize(12);
  doc.setTextColor(197, 160, 89);
  doc.text("QUOTATION SUMMARY", margin, currentY);
  doc.setDrawColor(197, 160, 89);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 1.5, margin + 46, currentY + 1.5);
  
  const summaryHeaders = ["Sr.", "Item Type", "Qty", "Gross Wt", "Net Wt"];
  const summaryWidths = [12, 78, 20, 35, 35];
  const summaryRows = groups.map((g, idx) => [(idx + 1).toString(), g.itemType, g.qty.toString(), g.grossWeight.toFixed(3), g.netWeight.toFixed(3)]);
  
  drawPDFTable(doc, summaryHeaders, summaryRows, margin, currentY + 4, summaryWidths, 7);
  
  const finalY = currentY + 4 + (groups.length + 1) * 7;
  doc.setFillColor(230, 230, 230);
  doc.rect(margin, finalY, summaryWidths[0] + summaryWidths[1], 7, "F");
  
  doc.setDrawColor(0, 0, 0);
  let curX = margin;
  doc.rect(curX, finalY, summaryWidths[0] + summaryWidths[1], 7);
  curX += summaryWidths[0] + summaryWidths[1];
  doc.rect(curX, finalY, summaryWidths[2], 7); curX += summaryWidths[2];
  doc.rect(curX, finalY, summaryWidths[3], 7); curX += summaryWidths[3];
  doc.rect(curX, finalY, summaryWidths[4], 7);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0,0,0);
  doc.text("Total", margin + (summaryWidths[0] + summaryWidths[1]) / 2, finalY + 4.5, { align: "center" });
  doc.text(totalQty.toString(), margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] / 2, finalY + 4.5, { align: "center" });
  doc.text(`Approx. ${totalGrossWeight.toFixed(3)} gms`, margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] + summaryWidths[3] / 2, finalY + 4.5, { align: "center" });
  doc.text(`Approx. ${totalNetWeight.toFixed(3)} gms`, margin + summaryWidths[0] + summaryWidths[1] + summaryWidths[2] + summaryWidths[3] + summaryWidths[4] / 2, finalY + 4.5, { align: "center" });

  currentY = finalY + 12; // Start images below summary

  const drawPageHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("QUOTATION", pageWidth / 2, 20, { align: "center", charSpace: 3 });
    doc.setDrawColor(197, 160, 89);
    doc.setLineWidth(0.5);
    doc.line(margin, 24, pageWidth - margin, 24);
  };

  // 3. Process items in a 2-column grid
  const imgBoxW = colWidth;
  const imgBoxH = 58;
  const tableH = 12; // 2 rows * 6mm
  const itemBlockSpacing = 10;
  const itemBlockH = imgBoxH + tableH + itemBlockSpacing; 
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const imgData = imageResults[i];

    if (currentY + itemBlockH > pageHeight - margin) {
      doc.addPage();
      drawPageHeader();
      currentY = 35;
    }

    const colIdx = i % 2;
    const x = margin + colIdx * (colWidth + colGap);
    
    // Draw Image outer box
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.setFillColor(255, 255, 255);
    doc.rect(x, currentY, colWidth, imgBoxH);

    if (imgData) {
      try {
        const format = detectImageFormat(imgData.base64);
        const ratio = Math.min((imgBoxW - 4) / imgData.width, (imgBoxH - 4) / imgData.height);
        const renderW = imgData.width * ratio;
        const renderH = imgData.height * ratio;
        const xOff = x + 2 + (imgBoxW - 4 - renderW) / 2;
        const yOff = currentY + 2 + (imgBoxH - 4 - renderH) / 2;
        doc.addImage(imgData.base64, format, xOff, yOff, renderW, renderH);
      } catch (err) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text("[Image Error]", x + colWidth / 2, currentY + 30, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text("[No Image]", x + colWidth / 2, currentY + 30, { align: "center" });
    }

    doc.setTextColor(0, 0, 0);
    const headers = ["Sr", "Design No", "KT", "Color", "Gross Wt", "Net Wt", "S Wt", "Qty"];
    const netWeight = item.netWeight !== undefined ? item.netWeight : item.grossWeight;
    const purity = item.metalPurity ? item.metalPurity.replace(/\s*kt\s*/gi, "") : "18";
    const color = (item as any).metalColor || (item as any).color || "Y";
    const sWt = ((item as any).stoneWeight || 0).toFixed(2);
    const qty = (item as any).qty?.toString() || "1";

    const rows = [[
      (i + 1).toString(),
      item.designNumber,
      purity,
      color,
      item.grossWeight.toFixed(3),
      netWeight.toFixed(3),
      sWt,
      qty
    ]];
    const widths = [6, 22, 6, 11, 13, 13, 8, 6];
    drawPDFTable(doc, headers, rows, x, currentY + imgBoxH + 2, widths, 6);

    if (colIdx === 1) {
      currentY += itemBlockH; // Move down after completing a row
    }
  }

  const filename = customer?.quotationNo ? `${customer.quotationNo}.pdf` : `Quotation_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
