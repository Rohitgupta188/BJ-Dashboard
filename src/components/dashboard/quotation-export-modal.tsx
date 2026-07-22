"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, FileDown, Loader2, User, Building2, Mail,
  MapPin, Phone, MessageSquare, ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────────────────────────
interface LineItem {
  product: {
    sku: string;
    designNumber: string;
    itemType?: string;
    grossWeight?: number;
    netWeight?: number;
    stoneWeight?: number;
    metalPurity?: string;
    metalType?: string;
    imageUrl?: string;
  };
  addedAt: Date;
}

interface Customer {
  _id: string;
  name: string;
  contactName: string;
  email?: string;
  phone: string;
  address: string;
}

interface Props {
  lineItems: LineItem[];
  onClose: () => void;
  onExported: (quotationNo: string) => void;
}

// ── localStorage cache key ─────────────────────────────────────────────────────
const CACHE_KEY = "bj_employee_quotation_form";

// ── Image fetch helper ─────────────────────────────────────────────────────────
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── PDF builder using installed jsPDF + jspdf-autotable ───────────────────────
async function buildQuotationPDF(params: {
  quotationNo: string;
  companyName: string;
  contactName: string;
  address: string;
  remarks: string;
  date: string;
  lineItems: LineItem[];
  logoBase64: string | null;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const {
    quotationNo, companyName, contactName,
    address, remarks, date, lineItems, logoBase64,
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
  const infoX = margin;
  const infoW = 100;
  const logoX = margin + infoW + 4;
  const logoW = pageW - margin - logoX;

  const infoRows = [
    [`Customer Name: ${companyName}`],
    [`Contact Name: ${contactName}`],
    [`Customer Address: ${address}`],
    [`Quotation: ${quotationNo}`],
    [`Date: ${date}`],
    [`Remarks: ${remarks}`],
  ];

  // Draw info box
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.3);
  const rowH = 6;
  infoRows.forEach((row, i) => {
    const y = curY + i * rowH;
    doc.rect(infoX, y, infoW, rowH);
    doc.setFont("helvetica", i < 5 ? "normal" : "bold");
    doc.text(row[0], infoX + 2, y + 4);
  });

  // Draw logo if available
  if (logoBase64) {
    try {
      const logoH = rowH * infoRows.length;
      doc.addImage(logoBase64, "PNG", logoX, curY, logoW, logoH);
    } catch { /* skip */ }
  } else {
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(197, 160, 89);
    doc.text("Brahammand\nJewellery", logoX + logoW / 2, curY + 12, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  curY += infoRows.length * rowH + 8;

  // ── Summary Table (grouped by item type) ────────────────────────────────────
  const groups = new Map<string, { qty: number; gross: number; net: number }>();
  for (const li of lineItems) {
    const type = li.product.itemType || "Jewellery";
    const prev = groups.get(type) ?? { qty: 0, gross: 0, net: 0 };
    groups.set(type, {
      qty: prev.qty + 1,
      gross: prev.gross + (li.product.grossWeight ?? 0),
      net: prev.net + (li.product.netWeight ?? 0),
    });
  }

  const totalGross = lineItems.reduce((s, li) => s + (li.product.grossWeight ?? 0), 0);
  const totalNet = lineItems.reduce((s, li) => s + (li.product.netWeight ?? 0), 0);
  const totalQty = lineItems.length;

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

  // ── Fetch product images in parallel ─────────────────────────────────────────
  const imageDataUrls = await Promise.all(
    lineItems.map(li => li.product.imageUrl ? fetchImageAsBase64(li.product.imageUrl) : Promise.resolve(null))
  );

  // ── Detail Table (one row per product with image) ─────────────────────────────
  const imgCellH = 28; // mm

  // Draw table header manually
  const colDefs = [
    { label: "Sr", w: 8 },
    { label: "Image", w: 32 },
    { label: "Design No.", w: 28 },
    { label: "KT", w: 10 },
    { label: "Color", w: 12 },
    { label: "Gross Wt.", w: 18 },
    { label: "Net Wt.", w: 17 },
    { label: "S Wt.", w: 13 },
    { label: "Qty", w: 12 },
    { label: "Remarks", w: 26 },
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

  // Check if detail table fits
  checkNewPage(imgCellH + 6);
  drawDetailHeader();

  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    const p = li.product;
    const imgData = imageDataUrls[i];

    checkNewPage(imgCellH + 4);

    let cx = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);

    // Draw row cells
    colDefs.forEach((col, ci) => {
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
        const format = imgData.startsWith("data:image/png") ? "PNG" : "JPEG";
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
    doc.text(p.designNumber, cx + colDefs[1].w / 2, curY + imgCellH - 1, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    cx += colDefs[1].w;

    // Design No.
    doc.text(p.designNumber, cx + colDefs[2].w / 2, rowMidY, { align: "center" });
    cx += colDefs[2].w;

    // KT
    const kt = p.metalPurity?.replace(/[^0-9]/g, "") || "18";
    doc.text(kt, cx + colDefs[3].w / 2, rowMidY, { align: "center" });
    cx += colDefs[3].w;

    // Color (metalType Y/W/R)
    const color = p.metalType?.charAt(0).toUpperCase() || "Y";
    doc.text(color, cx + colDefs[4].w / 2, rowMidY, { align: "center" });
    cx += colDefs[4].w;

    // Gross Wt
    doc.text((p.grossWeight ?? 0).toFixed(3), cx + colDefs[5].w / 2, rowMidY, { align: "center" });
    cx += colDefs[5].w;

    // Net Wt
    doc.text((p.netWeight ?? 0).toFixed(3), cx + colDefs[6].w / 2, rowMidY, { align: "center" });
    cx += colDefs[6].w;

    // S Wt
    doc.text((p.stoneWeight ?? 0).toFixed(3), cx + colDefs[7].w / 2, rowMidY, { align: "center" });
    cx += colDefs[7].w;

    // Qty
    doc.text("1", cx + colDefs[8].w / 2, rowMidY, { align: "center" });
    cx += colDefs[8].w;

    // Remarks
    // (empty by default)
    cx += colDefs[9].w;

    curY += imgCellH;
  }

  // Save
  doc.save(`Quotation_${quotationNo}.pdf`);
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function QuotationExportModal({ lineItems, onClose, onExported }: Props) {
  const [form, setForm] = useState({
    companyName: "",
    contactName: "",
    email: "",
    address: "",
    contactNumber: "",
    remarks: "",
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custSearch, setCustSearch] = useState("");
  const [loadingCust, setLoadingCust] = useState(false);
  const [showCustDrop, setShowCustDrop] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Load cached form (except remarks) ─────────────────────────────────────
  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setForm(f => ({
          ...f,
          companyName: parsed.companyName ?? "",
          contactName: parsed.contactName ?? "",
          email: parsed.email ?? "",
          address: parsed.address ?? "",
          contactNumber: parsed.contactNumber ?? "",
          // remarks NOT cached
        }));
      } catch { /* ignore */ }
    }
  }, []);

  // ── Persist cacheable fields ───────────────────────────────────────────────
  useEffect(() => {
    const { remarks: _, ...cacheable } = form;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheable));
  }, [form]);

  // ── Customer search ────────────────────────────────────────────────────────
  const searchCustomers = useCallback(async (q: string) => {
    setLoadingCust(true);
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(q)}&pageSize=8`);
      const data = await res.json();
      setCustomers(data.customers ?? []);
    } catch { /* ignore */ }
    finally { setLoadingCust(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(custSearch), 400);
    return () => clearTimeout(t);
  }, [custSearch, searchCustomers]);

  // ── Select customer → pre-fill ────────────────────────────────────────────
  function selectCustomer(c: Customer) {
    setSelectedCustomerId(c._id);
    setForm(f => ({
      ...f,
      companyName: c.name,
      contactName: c.contactName,
      email: c.email ?? "",
      address: c.address,
      contactNumber: c.phone,
    }));
    setShowCustDrop(false);
    setCustSearch(c.name);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function handleExport() {
    if (!form.companyName.trim() || !form.contactName.trim() || !form.address.trim() || !form.contactNumber.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setExporting(true);
    setError(null);

    try {
      // 1. Save to DB
      const payload = {
        customerId: selectedCustomerId || undefined,
        companyName: form.companyName,
        contactName: form.contactName,
        email: form.email,
        address: form.address,
        contactNumber: form.contactNumber,
        remarks: form.remarks,
        lineItems: lineItems.map(li => ({
          sku: li.product.sku,
          designNumber: li.product.designNumber,
          itemType: li.product.itemType,
          grossWeight: li.product.grossWeight,
          netWeight: li.product.netWeight,
          stoneWeight: li.product.stoneWeight ?? 0,
          metalPurity: li.product.metalPurity,
          metalType: li.product.metalType,
          imageUrl: li.product.imageUrl,
          qty: 1,
        })),
      };

      const res = await fetch("/api/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save quotation.");
      }

      const { quotationNo } = await res.json();

      // 2. Load logo
      let logoBase64: string | null = null;
      try {
        const logoRes = await fetch("/logo.png");
        if (logoRes.ok) {
          const logoBlob = await logoRes.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(logoBlob);
          });
        }
      } catch { /* no logo */ }

      // 3. Generate PDF
      const today = new Date().toLocaleDateString("en-IN", {
        day: "2-digit", month: "2-digit", year: "numeric",
      }).replace(/\//g, "-");

      await buildQuotationPDF({
        quotationNo,
        companyName: form.companyName,
        contactName: form.contactName,
        address: form.address,
        remarks: form.remarks,
        date: today,
        lineItems,
        logoBase64,
      });

      onExported(quotationNo);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  // ── Close on outside click of dropdown ────────────────────────────────────
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowCustDrop(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        style={{ animation: "fadeIn 0.25s ease" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-card rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <FileDown className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Export Quotation</p>
              <p className="text-[10px] text-muted-foreground">{lineItems.length} item{lineItems.length !== 1 ? "s" : ""} · PDF will be generated</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Customer selector */}
          <div ref={dropRef} className="relative">
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Select Existing Customer (optional)
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search customer by name…"
                value={custSearch}
                onChange={e => { setCustSearch(e.target.value); setShowCustDrop(true); }}
                onFocus={() => setShowCustDrop(true)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition"
              />
              <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
            {showCustDrop && (
              <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                {loadingCust ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                  </div>
                ) : customers.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">No customers found</p>
                ) : (
                  customers.map(c => (
                    <button
                      key={c._id}
                      onClick={() => selectCustomer(c)}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-primary/10 transition border-b border-border last:border-0"
                    >
                      <p className="font-semibold text-foreground">{c.name}</p>
                      <p className="text-muted-foreground">{c.contactName} · {c.phone}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">
              Customer Details <span className="text-destructive">*</span>
            </p>

            {/* Company Name */}
            <div className="space-y-3">
              <Field
                icon={<Building2 className="h-4 w-4" />}
                label="Company Name"
                required
                value={form.companyName}
                onChange={v => setForm(f => ({ ...f, companyName: v }))}
                placeholder="e.g. Tulsi Gold Jewellers"
              />
              <Field
                icon={<User className="h-4 w-4" />}
                label="Contact Name"
                required
                value={form.contactName}
                onChange={v => setForm(f => ({ ...f, contactName: v }))}
                placeholder="e.g. Jutuji"
              />
              <Field
                icon={<Mail className="h-4 w-4" />}
                label="Email"
                value={form.email}
                onChange={v => setForm(f => ({ ...f, email: v }))}
                placeholder="email@example.com"
                type="email"
              />
              <Field
                icon={<MapPin className="h-4 w-4" />}
                label="Address"
                required
                value={form.address}
                onChange={v => setForm(f => ({ ...f, address: v }))}
                placeholder="e.g. Zaveri Bazar, Mumbai"
              />
              <Field
                icon={<Phone className="h-4 w-4" />}
                label="Contact Number"
                required
                value={form.contactNumber}
                onChange={v => setForm(f => ({ ...f, contactNumber: v }))}
                placeholder="+91 98765 43210"
                type="tel"
              />
              {/* Remark — NOT cached */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Remark</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <textarea
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="e.g. All design in 18K yellow gold, high polish with 20% rhodium"
                    rows={2}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items summary */}
          <div className="rounded-xl border border-border bg-muted/10 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 font-medium">Items in Quotation</p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {lineItems.map((li, i) => (
                <span key={li.product.sku} className="text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-md px-2 py-0.5 font-mono">
                  {i + 1}. {li.product.designNumber}
                </span>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition shadow-[0_4px_16px_rgba(197,160,89,0.3)]"
            >
              {exporting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating PDF…</>
              ) : (
                <><FileDown className="h-4 w-4" /> Export PDF</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Field helper ───────────────────────────────────────────────────────────────
function Field({
  icon, label, value, onChange, placeholder, required = false, type = "text",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-2.5 text-muted-foreground">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition"
        />
      </div>
    </div>
  );
}
