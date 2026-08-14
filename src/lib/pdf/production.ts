import { PdfQuotationLineItem } from "./quotation";
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
 * Compress an image aggressively to a JPEG to save space.
 */
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
      
      // Fill with white background in case of transparent PNGs
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      
      // Compress to JPEG to aggressively save space
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
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
    const rawBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null as any);
      reader.readAsDataURL(blob);
    });
    if (!rawBase64) return null;

    const base64 = await compressImage(rawBase64, 1200);

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

export interface BuildProductionPDFParams {
  quotationNo: string;
  companyName: string;
  contactName: string;
  address: string;
  remarks: string;
  date: string;
  lineItems: PdfQuotationLineItem[];
  logoBase64: string | null;
}

export async function buildProductionPDF(params: BuildProductionPDFParams): Promise<void> {
  const {
    quotationNo,
    companyName,
    contactName,
    address,
    date,
    lineItems,
    logoBase64,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 6; // decreased margin for more space

  // Grid Settings
  const cols = 2;
  const colGap = 4;
  const rowGap = 2;
  const cellW = (pageW - 2 * margin - (cols - 1) * colGap) / cols; // ~93mm
  const cellH = 46;

  // Image Settings inside cell
  const imgW = 50; // slightly decreased image width to give text more room
  const imgH = 44; // keep height within cell
  const textStartX = imgW + 2; // Offset for text area
  const textW = cellW - textStartX - 2;

  // Pre-fetch images
  const imageResults = await Promise.all(lineItems.map((item) => item.imageUrl ? getImageDataUrl(item.imageUrl) : Promise.resolve(null)));

  let curY = margin;

  // --- DRAW HEADER (First Page Only) ---
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(197, 160, 89);
  doc.text(`Job Card No. ${quotationNo}`, pageW - margin, curY, { align: "right" });
  
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("PRODUCTION JOB CARD", pageW / 2, curY + 2, { align: "center" });
  
  curY += 8;

  const tableW = pageW - 2 * margin;
  const infoW = tableW * 0.7;
  const logoX = margin + infoW;
  const logoW = tableW - infoW;

  const infoRows = [
    [`Customer Name: ${companyName}`],
    [`Contact Name: ${contactName}`],
    [`Customer Address: ${address}`],
    [`Date: ${date}`],
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  const parsedRows = infoRows.map(r => {
    const lines = doc.splitTextToSize(r[0], infoW - 4);
    return { text: lines, height: Math.max(5, lines.length * 3.5 + 1.5) };
  });

  const totalH = parsedRows.reduce((sum, r) => sum + r.height, 0);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(margin, curY, tableW, totalH);
  doc.line(logoX, curY, logoX, curY + totalH);

  let currentYOffset = curY;
  parsedRows.forEach((row, i) => {
    if (i > 0) doc.line(margin, currentYOffset, logoX, currentYOffset);
    doc.text(row.text, margin + 2, currentYOffset + 3.5);
    currentYOffset += row.height;
  });

  let finalLogo = logoBase64;
  if (logoBase64) {
    try {
      finalLogo = await compressImage(logoBase64, 1500);
    } catch (e) {
      console.warn("Failed to compress logo", e);
    }
  }

  if (finalLogo) {
    try {
      const lW = logoW - 4;
      const lH = Math.min(lW * 0.6, totalH - 2);
      const lY = curY + (totalH - lH) / 2;
      const format = detectImageFormat(finalLogo);
      doc.addImage(finalLogo, format, logoX + 2, lY, lW, lH);
    } catch { /* skip */ }
  } else {
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(197, 160, 89);
    doc.text("Brahammand\nJewellery", logoX + logoW / 2, curY + totalH / 2, { align: "center", baseline: "middle" });
    doc.setTextColor(0, 0, 0);
  }

  curY += totalH + 6;

  // --- DRAW GRID ---
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    const imgData = imageResults[i];

    // Check page break
    if (curY + cellH > pageH - margin) {
      doc.addPage();
      curY = margin;
      
      // Minimal header on subsequent pages
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(197, 160, 89);
      doc.text(`Job Card No. ${quotationNo}`, pageW - margin, curY + 3, { align: "right" });
      curY += 8;
    }

    const colIdx = i % cols;
    const cx = margin + colIdx * (cellW + colGap);
    
    // Draw outer cell bottom border only
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(cx, curY + cellH, cx + cellW, curY + cellH);

    // Draw Image
    if (imgData) {
      try {
        const format = detectImageFormat(imgData.base64);
        const ratio = Math.min((imgW - 2) / imgData.width, (imgH - 2) / imgData.height);
        const renderW = imgData.width * ratio;
        const renderH = imgData.height * ratio;
        const xOff = cx + 1 + (imgW - 2 - renderW) / 2;
        const yOff = curY + 1 + (imgH - 2 - renderH) / 2;
        doc.addImage(imgData.base64, format, xOff, yOff, renderW, renderH);
      } catch {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text("Error", cx + imgW / 2, curY + imgH / 2, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text("No Image", cx + imgW / 2, curY + imgH / 2, { align: "center" });
    }

    // Vertical line separating image and text
    doc.setLineWidth(0.15);
    doc.line(cx + imgW, curY, cx + imgW, curY + cellH);

    // --- Text Area ---
    doc.setTextColor(0, 0, 0);
    const tx = cx + textStartX;
    let ty = curY + 4; // Start Y inside text area

    // Checkboxes Row (CAM, WAX, CAST)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    const boxSize = 3;
    
    // CAM
    doc.rect(tx, ty - 2.5, boxSize, boxSize);
    doc.text("CAM", tx + boxSize + 1, ty);
    
    // WAX
    const waxX = tx + 11;
    doc.rect(waxX, ty - 2.5, boxSize, boxSize);
    doc.text("WAX", waxX + boxSize + 1, ty);
    
    // CAST
    const castX = tx + 22;
    doc.rect(castX, ty - 2.5, boxSize, boxSize);
    doc.text("CAST", castX + boxSize + 1, ty);

    // Divider line below checkboxes
    ty += 2.5;
    doc.setDrawColor(200, 200, 200);
    doc.line(tx, ty, cx + cellW, ty);
    
    ty += 4;
    
    // Text styling
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    
    const lineHeight = 4.2; // Slightly tighter line height to fit line-by-line comfortably
    const kt = li.metalPurity?.replace(/[^0-9]/g, "") || "18";
    const color = li.metalType?.charAt(0).toUpperCase() || "Y";

    // Write all properties
    doc.setFont("helvetica", "bold");
    doc.text(`Design No: ${li.designNumber || "-"}`, tx, ty);
    doc.setFont("helvetica", "normal");
    ty += lineHeight;

    // Gross Wt & Karat on one line (2 columns)
    const col2X = tx + 25; // Increased gap for 2nd column
    doc.text(`Gross Wt: ${(li.grossWeight ?? 0).toFixed(3)}`, tx, ty);
    doc.text(`Karat: ${kt}K`, col2X, ty); 
    ty += lineHeight;
    
    // Net Wt & Color on one line (2 columns)
    doc.text(`Net Wt: ${(li.netWeight ?? 0).toFixed(3)}`, tx, ty);
    doc.text(`Color: ${color}`, col2X, ty); 
    ty += lineHeight;

    // Stone Wt & Quantity on one line (2 columns)
    doc.text(`Stone Wt: ${(li.stoneWeight ?? 0).toFixed(3)}`, tx, ty);
    doc.text(`Quantity: ${li.qty ?? 1}`, col2X, ty); 
    ty += lineHeight;

    // Row 5: Remarks (Full width, can wrap)
    if (li.remarks) {
      const lines = doc.splitTextToSize(`Remarks: ${li.remarks}`, textW - 1);
      doc.text(lines, tx, ty);
    }

    // Advance Y only if we completed a row (every 2 items)
    if (colIdx === cols - 1) {
      curY += cellH + rowGap;
    }
  }

  // Save the PDF
  doc.save(`${quotationNo || "Production_JobCard"}.pdf`);
}
