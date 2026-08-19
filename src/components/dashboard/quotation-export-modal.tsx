"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X, FileDown, Loader2, User, Building2, Mail,
  MapPin, Phone, MessageSquare, ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { buildQuotationPDF, PdfQuotationLineItem } from "@/lib/pdf";
import { generateCatalogPDF } from "@/lib/pdf";
import { buildProductionPDF } from "@/lib/pdf";

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

// Local helper removed, using buildQuotationPDF from lib

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
  const [templateStyle, setTemplateStyle] = useState<"sales" | "executive" | "production">("sales");
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
      const mappedLineItems: PdfQuotationLineItem[] = lineItems.map((li) => ({
        sku: li.product.sku,
        designNumber: li.product.designNumber,
        itemType: li.product.itemType,
        grossWeight: li.product.grossWeight,
        netWeight: li.product.netWeight,
        stoneWeight: li.product.stoneWeight,
        metalPurity: li.product.metalPurity,
        metalType: li.product.metalType,
        imageUrl: li.product.imageUrl,
        qty: 1, // Default from earlier scanner logic
        remarks: "",
      }));

      // Generate PDF based on selected template
      if (templateStyle === "executive") {
        await generateCatalogPDF({
          items: mappedLineItems as any,
          customer: {
            companyName: form.companyName,
            contactName: form.contactName,
            address: form.address,
            quotationNo: quotationNo,
            date: new Date().toLocaleDateString("en-IN"),
            logoBase64,
            remarks: form.remarks
          }
        });
      } else if (templateStyle === "production") {
        await buildProductionPDF({
          quotationNo: quotationNo,
          companyName: form.companyName,
          contactName: form.contactName,
          address: form.address,
          remarks: form.remarks,
          date: new Date().toLocaleDateString("en-IN"),
          lineItems: mappedLineItems,
          logoBase64,
        });
      } else {
        await buildQuotationPDF({
          quotationNo: quotationNo,
          companyName: form.companyName,
          contactName: form.contactName,
          address: form.address,
          remarks: form.remarks,
          date: new Date().toLocaleDateString("en-IN"),
          lineItems: mappedLineItems,
          logoBase64,
          withImages: true,
        });
      }

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

          {/* Template Style Selection */}
          <div className="pt-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">
              Template Style
            </p>
            <div className="flex gap-3">
              <label className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-xl cursor-pointer transition-all ${templateStyle === "sales" ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(197,160,89,0.15)]" : "border-border hover:bg-muted/20"}`}>
                <input type="radio" name="template" value="sales" checked={templateStyle === "sales"} onChange={() => setTemplateStyle("sales")} className="hidden" />
                <span className={`text-sm font-bold ${templateStyle === "sales" ? "text-primary" : "text-foreground"}`}>Sales Quotation</span>
                <span className="text-[10px] text-muted-foreground mt-1">Standard layout with remarks</span>
              </label>
              <label className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-xl cursor-pointer transition-all ${templateStyle === "executive" ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(197,160,89,0.15)]" : "border-border hover:bg-muted/20"}`}>
                <input type="radio" name="template" value="executive" checked={templateStyle === "executive"} onChange={() => setTemplateStyle("executive")} className="hidden" />
                <span className={`text-sm font-bold ${templateStyle === "executive" ? "text-primary" : "text-foreground"}`}>Executive Catalog</span>
                <span className="text-[10px] text-muted-foreground mt-1">Premium image grid layout</span>
              </label>
              <label className={`flex-1 flex flex-col items-center justify-center p-3 border rounded-xl cursor-pointer transition-all ${templateStyle === "production" ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(197,160,89,0.15)]" : "border-border hover:bg-muted/20"}`}>
                <input type="radio" name="template" value="production" checked={templateStyle === "production"} onChange={() => setTemplateStyle("production")} className="hidden" />
                <span className={`text-sm font-bold text-center ${templateStyle === "production" ? "text-primary" : "text-foreground"}`}>Production Job Card</span>
                <span className="text-[10px] text-muted-foreground mt-1 text-center">10-12 items per page grid</span>
              </label>
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
