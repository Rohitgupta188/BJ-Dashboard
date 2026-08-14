export interface PdfQuotationLineItem {
  sku: string;
  designNumber: string;
  itemType?: string;
  grossWeight?: number;
  netWeight?: number;
  stoneWeight?: number;
  metalPurity?: string;
  metalType?: string;
  imageUrl?: string;
  qty?: number;
  remarks?: string;
}

export interface BuildQuotationPDFParams {
  quotationNo: string;
  companyName: string;
  contactName: string;
  address: string;
  remarks: string;
  date: string;
  lineItems: PdfQuotationLineItem[];
  logoBase64: string | null;
  withImages?: boolean; // New parameter to toggle images
}

function detectImageFormat(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

async function compressImage(base64Str: string, maxWidth: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxWidth || h > maxWidth) {
        if (w > h) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        } else {
          w = Math.round((w * maxWidth) / h);
          h = maxWidth;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(base64Str);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const rawBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
    if (!rawBase64) return null;
    return await compressImage(rawBase64, 1200);
  } catch {
    return null;
  }
}

export async function buildQuotationPDF(params: BuildQuotationPDFParams): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const {
    quotationNo, companyName, contactName,
    address, remarks, date, lineItems, logoBase64,
    withImages = true,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 14;
  let curY = 10;

  // ── Quotation No (top right) ────────────────────────────────────────────────
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(197, 160, 89);
  doc.text(`Quotation No. ${quotationNo}`, pageW - margin, curY, { align: "right" });
  curY += 8;

  // ── Title ───────────────────────────────────────────────────────────────────
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text("QUOTATION", pageW / 2, curY, { align: "center" });
  curY += 8;

  // ── Info block: Customer table LEFT + Logo RIGHT ────────────────────────────
  const tableW = pageW - 2 * margin;
  const infoW = tableW * 0.7; // 70% for info, 30% for logo
  const logoX = margin + infoW;
  const logoW = tableW - infoW;

  const infoRows = [
    [`Customer Name: ${companyName}`],
    [`Contact Name: ${contactName}`],
    [`Customer Address: ${address}`],
    [`Quotation: ${quotationNo}`],
    [`Date: ${date}`],
  ];

  if (remarks) {
    infoRows.push([`Remarks: ${remarks}`]);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);

  const parsedRows = infoRows.map(r => {
    const lines = doc.splitTextToSize(r[0], infoW - 4);
    return {
      text: lines,
      height: Math.max(6, lines.length * 4 + 2)
    };
  });

  const totalH = parsedRows.reduce((sum, r) => sum + r.height, 0);

  // Draw outer box
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(margin, curY, tableW, totalH);

  // Draw vertical line separating info and logo
  doc.line(logoX, curY, logoX, curY + totalH);

  // Draw info rows
  let currentYOffset = curY;
  parsedRows.forEach((row, i) => {
    if (i > 0) doc.line(margin, currentYOffset, logoX, currentYOffset);
    doc.text(row.text, margin + 2, currentYOffset + 4);
    currentYOffset += row.height;
  });

  let finalLogo = logoBase64;
  if (logoBase64) {
    try {
      finalLogo = await compressImage(logoBase64, 1200);
    } catch (e) {
      console.warn("Failed to compress logo", e);
    }
  }

  // Draw logo
  if (finalLogo) {
    try {
      const lW = logoW - 4;
      const lH = lW * 0.6; // Approximation for aspect ratio
      const lY = curY + (totalH - lH) / 2;
      const format = detectImageFormat(finalLogo);
      doc.addImage(finalLogo, format, logoX + 2, lY, lW, lH);
    } catch { /* skip */ }
  } else {
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(197, 160, 89);
    doc.text("Brahammand\nJewellery", logoX + logoW / 2, curY + totalH / 2, { align: "center", baseline: "middle" });
    doc.setTextColor(0, 0, 0);
  }

  curY += totalH + 8;

  // ── Summary Table (grouped by item type) ────────────────────────────────────
  const groups = new Map<string, { qty: number; gross: number; net: number }>();
  for (const li of lineItems) {
    const type = li.itemType || "Jewellery";
    const qty = li.qty ?? 1;
    const prev = groups.get(type) ?? { qty: 0, gross: 0, net: 0 };
    groups.set(type, {
      qty: prev.qty + qty,
      gross: prev.gross + (li.grossWeight ?? 0) * qty,
      net: prev.net + (li.netWeight ?? 0) * qty,
    });
  }

  const totalGross = lineItems.reduce((s, li) => s + (li.grossWeight ?? 0) * (li.qty ?? 1), 0);
  const totalNet = lineItems.reduce((s, li) => s + (li.netWeight ?? 0) * (li.qty ?? 1), 0);
  const totalQty = lineItems.reduce((s, li) => s + (li.qty ?? 1), 0);

  const summaryBody: string[][] = Array.from(groups.entries()).map(([type, v], i) => [
    String(i + 1),
    type,
    String(v.qty),
    v.gross.toFixed(3),
    v.net.toFixed(3),
  ]);

  autoTable(doc, {
    startY: curY,
    head: [["Sr.", "Item Type", "Qty", "Gross Wt", "Net Wt"]],
    body: summaryBody,
    foot: [[
      "", "Total",
      String(totalQty),
      `Approx. ${totalGross.toFixed(3)} gms`,
      `Approx. ${totalNet.toFixed(3)} gms`,
    ]],
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: "bold" },
    columnStyles: { 1: { halign: "center" } },
    tableLineColor: [0, 0, 0],
    tableLineWidth: 0.3,
  });

  curY = (doc as any).lastAutoTable.finalY + 10;

  // ── Detail Table ─────────────────────────────

  if (!withImages) {
    // Render detail table without images using autoTable
    const detailBody = lineItems.map((li, i) => {
      const kt = li.metalPurity?.replace(/[^0-9]/g, "") || "18";
      const color = li.metalType?.charAt(0).toUpperCase() || "Y";
      return [
        String(i + 1),
        li.designNumber,
        kt,
        color,
        (li.grossWeight ?? 0).toFixed(3),
        (li.netWeight ?? 0).toFixed(3),
        (li.stoneWeight ?? 0).toFixed(3),
        String(li.qty ?? 1),
        li.remarks || "",
      ];
    });

    autoTable(doc, {
      startY: curY,
      head: [["Sr", "Design No.", "KT", "Color", "Gross Wt", "Net Wt", "S Wt", "Qty", "Remarks"]],
      body: detailBody,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 2, halign: "center", lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: "bold" },
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.25,
    });
  } else {
    // Render detail table with images manually
    const imageDataUrls = await Promise.all(
      lineItems.map(li => li.imageUrl ? fetchImageAsBase64(li.imageUrl) : Promise.resolve(null))
    );

    const imgCellH = 28; // mm

    const colDefs = [
      { label: "Sr", w: 8 },
      { label: "Image", w: 32 },
      { label: "Design No.", w: 26 },
      { label: "KT", w: 10 },
      { label: "Color", w: 10 },
      { label: "Gross Wt.", w: 18 },
      { label: "Net Wt.", w: 18 },
      { label: "S Wt.", w: 13 },
      { label: "Qty", w: 12 },
      { label: "Remarks", w: 35 },
    ];

    const tableW = colDefs.reduce((s, c) => s + c.w, 0);

    function checkNewPage(neededH: number) {
      if (curY + neededH > 275) {
        doc.addPage();
        curY = 14;
        drawDetailHeader();
      }
    }

    function drawDetailHeader() {
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, curY, tableW, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      let cx = margin;
      colDefs.forEach(col => {
        doc.rect(cx, curY, col.w, 6);
        doc.text(col.label, cx + col.w / 2, curY + 4, { align: "center" });
        cx += col.w;
      });
      curY += 6;
    }

    checkNewPage(imgCellH + 6);
    drawDetailHeader();

    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i];
      const imgData = imageDataUrls[i];

      checkNewPage(imgCellH + 4);

      let cx = margin;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);

      // Draw row cells
      colDefs.forEach((col) => {
        doc.rect(cx, curY, col.w, imgCellH);
        cx += col.w;
      });

      // Fill cell text
      cx = margin;
      const rowMidY = curY + imgCellH / 2 + 2.5;

      // Sr
      doc.text(String(i + 1), cx + colDefs[0].w / 2, rowMidY, { align: "center" });
      cx += colDefs[0].w;

      // Image cell
      if (imgData) {
        try {
          const format = detectImageFormat(imgData);
          doc.addImage(imgData, format, cx + 1, curY + 1, colDefs[1].w - 2, imgCellH - 2);
        } catch { /* skip */ }
      } else {
        doc.setTextColor(120, 120, 120);
        doc.text("No\nImage", cx + colDefs[1].w / 2, curY + imgCellH / 2, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }

      // Design No label below image
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.text(li.designNumber, cx + colDefs[1].w / 2, curY + imgCellH - 1, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      cx += colDefs[1].w;

      // Design No.
      doc.text(li.designNumber, cx + colDefs[2].w / 2, rowMidY, { align: "center" });
      cx += colDefs[2].w;

      // KT
      const kt = li.metalPurity?.replace(/[^0-9]/g, "") || "18";
      doc.text(kt, cx + colDefs[3].w / 2, rowMidY, { align: "center" });
      cx += colDefs[3].w;

      // Color (metalType Y/W/R)
      const color = li.metalType?.charAt(0).toUpperCase() || "Y";
      doc.text(color, cx + colDefs[4].w / 2, rowMidY, { align: "center" });
      cx += colDefs[4].w;

      // Gross Wt
      doc.text((li.grossWeight ?? 0).toFixed(3), cx + colDefs[5].w / 2, rowMidY, { align: "center" });
      cx += colDefs[5].w;

      // Net Wt
      doc.text((li.netWeight ?? 0).toFixed(3), cx + colDefs[6].w / 2, rowMidY, { align: "center" });
      cx += colDefs[6].w;

      // S Wt
      doc.text((li.stoneWeight ?? 0).toFixed(3), cx + colDefs[7].w / 2, rowMidY, { align: "center" });
      cx += colDefs[7].w;

      // Qty
      doc.text(String(li.qty ?? 1), cx + colDefs[8].w / 2, rowMidY, { align: "center" });
      cx += colDefs[8].w;

      // Remarks
      if (li.remarks) {
        // Multi-line remarks handling
        const lines = doc.splitTextToSize(li.remarks, colDefs[9].w - 2);
        const yOffset = curY + (imgCellH / 2) - ((lines.length - 1) * 2);
        doc.text(lines, cx + colDefs[9].w / 2, yOffset, { align: "center" });
      }
      cx += colDefs[9].w;

      curY += imgCellH;
    }
  }

  // Save
  doc.save(`${quotationNo || "Quotation"}.pdf`);
}
