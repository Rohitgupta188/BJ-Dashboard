"use client";

import React, { useState, useEffect } from "react";
import { X, Trash2, Pencil, Download, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildQuotationPDF } from "@/lib/generate-quotation-pdf";
import { Checkbox } from "@/components/ui/checkbox";

interface QuotationDetailModalProps {
  quotationNo: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function QuotationDetailModal({ quotationNo, onClose, onUpdated }: QuotationDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quotation, setQuotation] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [globalRemarks, setGlobalRemarks] = useState("");
  const [attachImage, setAttachImage] = useState(true);

  // Search
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/catalog?search=${encodeURIComponent(searchQuery)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const addProduct = (item: any) => {
    const newItem = {
      sku: item.sku,
      designNumber: item.designNumber,
      itemType: item.itemType,
      grossWeight: item.grossWeight,
      netWeight: item.netWeight,
      stoneWeight: 0,
      metalPurity: item.metalPurity,
      metalType: item.metalType,
      imageUrl: item.imageUrl,
      qty: 1,
      remarks: "",
    };
    setItems((prev) => [newItem, ...prev]);
    setShowSearchDropdown(false);
    setSearchQuery("");
  };

  // Pagination (local)
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  useEffect(() => {
    fetchQuotation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationNo]);

  const fetchQuotation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotations/${quotationNo}`);
      if (res.ok) {
        const data = await res.json();
        setQuotation(data.quotation);
        setItems(data.quotation.lineItems || []);
        setGlobalRemarks(data.quotation.remarks || "");
      }
    } catch (error) {
      console.error("Failed to load quotation", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quotations/${quotationNo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks: globalRemarks,
          lineItems: items,
        }),
      });
      if (res.ok) {
        onUpdated();
        onClose();
      }
    } catch (error) {
      console.error("Failed to save", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!quotation) return;
    try {
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
      } catch (e) { console.error("Logo fetch failed", e); }

      await buildQuotationPDF({
        quotationNo: quotation.quotationNo,
        companyName: quotation.companyName,
        contactName: quotation.contactName,
        address: quotation.address,
        remarks: globalRemarks,
        date: new Date(quotation.date).toLocaleDateString("en-IN"),
        lineItems: items,
        logoBase64,
        withImages: attachImage,
      });
    } catch (error) {
      console.error("PDF generation failed:", error);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const totalPages = Math.max(1, Math.ceil(items.length / rowsPerPage));
  const displayedItems = items.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-5xl h-[95vh] flex flex-col border border-border">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-card rounded-t-xl shrink-0">
          <h2 className="text-xl font-bold text-foreground">
            Quotation : <span className="text-primary">{quotationNo}</span>
          </h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted/30 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/10 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-2">
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox checked={attachImage} onCheckedChange={(v) => setAttachImage(!!v)} />
              Attach Image
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowSearchDropdown(!showSearchDropdown)} className={`bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 rounded-full w-9 h-9 p-0 transition-all ${showSearchDropdown ? "rotate-45" : ""}`}>
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { if(confirm("Clear all items?")) setItems([]); }} className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 rounded-full w-9 h-9 p-0">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Product Search Add */}
        {showSearchDropdown && (
          <div className="p-4 border-b border-border bg-card shrink-0 relative animate-in fade-in slide-in-from-top-2 duration-200">
            <Input 
              placeholder="Search design no or SKU to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background/50 border-border"
              autoFocus
            />
            {isSearching && (
              <div className="absolute right-6 top-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="absolute top-16 left-4 right-4 bg-popover border border-border rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto p-2">
                {searchResults.map((p, i) => (
                  <div key={i} onClick={() => addProduct(p)} className="flex items-center gap-3 p-2 hover:bg-accent rounded-lg cursor-pointer transition">
                    <div className="w-10 h-10 shrink-0 bg-white rounded border border-border flex items-center justify-center overflow-hidden">
                      {p.imageUrl ? <img src={p.imageUrl} alt={p.designNumber} className="w-full h-full object-contain" /> : "💎"}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-foreground">{p.designNumber}</div>
                      <div className="text-xs text-muted-foreground">{p.sku} • {p.metalPurity} • {Number(p.grossWeight || 0).toFixed(3)}g</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-muted/5 space-y-4">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            displayedItems.map((item, localIndex) => {
              const actualIndex = (page - 1) * rowsPerPage + localIndex;
              return (
                <div key={actualIndex} className="bg-card border border-border rounded-xl p-3 flex gap-4 relative shadow-sm">
                  {/* Actions (right absolute) */}
                  <div className="absolute right-3 top-3 flex flex-col gap-2">
                    <button onClick={() => removeItem(actualIndex)} className="p-1.5 text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-full transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Image */}
                  <div className="w-32 h-32 shrink-0 bg-white rounded-lg border border-border flex items-center justify-center overflow-hidden p-2">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.designNumber} className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-3xl">💎</span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 mr-10">
                    <div className="space-y-2 text-sm">
                      <div className="font-bold text-lg">{item.designNumber}</div>
                      <div className="text-muted-foreground">{item.metalPurity || "18KT"}</div>
                      <div className="text-muted-foreground">{item.metalType?.charAt(0).toUpperCase() || "Y"}</div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-4 w-full bg-muted/20 p-2 rounded-lg border border-border">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">GR WT :</label>
                          <Input 
                            type="number"
                            value={item.grossWeight || 0}
                            onChange={(e) => updateItem(actualIndex, "grossWeight", parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0 text-emerald-600 font-bold" 
                          />
                        </div>
                        <div className="flex-1 border-l border-border pl-3">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">NT WT :</label>
                          <Input 
                            type="number"
                            value={item.netWeight || 0}
                            onChange={(e) => updateItem(actualIndex, "netWeight", parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0 font-bold" 
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 w-full bg-muted/20 p-2 rounded-lg border border-border">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Remarks</label>
                          <Input 
                            value={item.remarks || ""} 
                            onChange={(e) => updateItem(actualIndex, "remarks", e.target.value)}
                            className="h-8 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0" 
                            placeholder="Enter remarks..."
                          />
                        </div>
                        <div className="w-16 shrink-0 border-l border-border pl-2">
                          <label className="text-[10px] text-muted-foreground uppercase font-bold mb-1 block">Q :</label>
                          <Input 
                            type="number"
                            value={item.qty || 1}
                            onChange={(e) => updateItem(actualIndex, "qty", parseInt(e.target.value) || 1)}
                            className="h-8 text-xs bg-transparent border-none shadow-none focus-visible:ring-0 p-0" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination & Global Remarks */}
        <div className="p-4 border-t border-border bg-card rounded-b-xl shrink-0 flex flex-col gap-4">
          <div className="flex items-center justify-end text-sm text-muted-foreground gap-4">
            <span>Rows per page: {rowsPerPage}</span>
            <span>{Math.min((page - 1) * rowsPerPage + 1, items.length)}–{Math.min(page * rowsPerPage, items.length)} of {items.length}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1 hover:bg-muted rounded disabled:opacity-50">{"<"}</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1 hover:bg-muted rounded disabled:opacity-50">{">"}</button>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <label className="font-bold text-sm shrink-0 mt-2">Remarks</label>
            <textarea
              className="flex-1 min-h-20 p-3 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none resize-none"
              value={globalRemarks}
              onChange={(e) => setGlobalRemarks(e.target.value)}
              placeholder="Global quotation remarks..."
            />
          </div>

          <div className="flex justify-between items-center mt-2">
            <Button variant="outline" onClick={onClose} className="px-8 border-border">CANCEL</Button>
            <Button onClick={handleSave} disabled={saving} className="px-10 bg-emerald-500 hover:bg-emerald-600 text-white font-bold tracking-wide">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "SAVE"}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
