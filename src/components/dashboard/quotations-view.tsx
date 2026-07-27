"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText, Layers, Grid, Search,
  RotateCcw, Eye, Download, Trash2,
  AlertCircle, ChevronLeft, ChevronRight, Truck, Send
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import QuotationDetailModal from "@/components/dashboard/quotation-detail-modal";
import { buildQuotationPDF } from "@/lib/generate-quotation-pdf";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Quotation {
  _id: string;
  quotationNo: string;
  date: string;
  companyName: string;
  contactName: string;
  totalGrossWeight: number;
  totalNetWeight: number;
  totalItems: number;
  isDispatched: boolean;
  createdAt: string;
}

interface QuotationsResponse {
  quotations: Quotation[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function QuotationsView() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const initEndDate = new Date();
  const initStartDate = new Date();
  initStartDate.setDate(initStartDate.getDate() - 7);
  const formatDateForInput = (d: Date) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  };

  const [search, setSearch]       = useState("");
  const [startDate, setStartDate] = useState(formatDateForInput(initStartDate));
  const [endDate, setEndDate]     = useState(formatDateForInput(initEndDate));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading]     = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [viewingQuotation, setViewingQuotation] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch
  const fetchQuotations = useCallback(async () => {
    if (quotations.length === 0) setLoading(true);
    else setIsRefetching(true);
    
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/quotations?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuotationsResponse = await res.json();
      setQuotations(data.quotations ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load quotations.");
    } finally {
      setLoading(false);
      setIsRefetching(false);
    }
  }, [page, debouncedSearch, startDate, endDate]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  const handleBulkDownload = async () => {
    if (selected.size === 0) return;
    setDownloading(true);
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

      for (const id of Array.from(selected)) {
        const q = quotations.find((x) => x._id === id);
        if (!q) continue;
        const res = await fetch(`/api/quotations/${q.quotationNo}`);
        if (res.ok) {
          const data = await res.json();
          const fullQ = data.quotation;
          await buildQuotationPDF({
            quotationNo: fullQ.quotationNo,
            companyName: fullQ.companyName,
            contactName: fullQ.contactName,
            address: fullQ.address,
            remarks: fullQ.remarks,
            date: new Date(fullQ.date).toLocaleDateString("en-IN"),
            lineItems: fullQ.lineItems,
            logoBase64,
            withImages: true,
          });
        }
      }
    } catch (err) {
      console.error("Bulk download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selected.size} quotations?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotations/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) })
      });
      if (res.ok) {
        setSelected(new Set());
        fetchQuotations();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete.");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting quotations.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleDispatch = async (quotationNo: string, currentStatus: boolean) => {
    try {
      setQuotations(prev => prev.map(q => q.quotationNo === quotationNo ? { ...q, isDispatched: !currentStatus } : q));
      await fetch(`/api/quotations/${quotationNo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDispatched: !currentStatus }),
      });
    } catch (err) {
      console.error(err);
      fetchQuotations(); // revert on error
    }
  };

  // Stats derived from current page (summary)
  const totalGross = quotations.reduce((s, q) => s + (q.totalGrossWeight ?? 0), 0);
  const totalNet   = quotations.reduce((s, q) => s + (q.totalNetWeight   ?? 0), 0);
  const dispatchedCount = quotations.filter(q => q.isDispatched).length;
  const dispatchedPercent = quotations.length > 0 ? ((dispatchedCount / quotations.length) * 100).toFixed(2) : "0.00";

  // Selection
  const allSelected = quotations.length > 0 && quotations.every(q => selected.has(q._id));
  const toggleAll  = () => setSelected(allSelected ? new Set() : new Set(quotations.map(q => q._id)));
  const toggleOne  = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <>
      {/* ── Quotations ────────────────────────────────────────────────────── */}
      {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-foreground mb-6">
            <StatCard
              title="Gross Weight (Page)"
              value={`${totalGross.toFixed(2)} g`}
              icon={<FileText className="h-5 w-5" />}
            />
            <StatCard
              title="Net Gold Weight (Page)"
              value={`${totalNet.toFixed(2)} g`}
              icon={<Layers className="h-5 w-5" />}
            />
            <StatCard
              title="Total Quotations"
              value={`${total}`}
              icon={<Grid className="h-5 w-5" />}
            />
            <StatCard
              title="Dispatched"
              value={`${dispatchedPercent}%`}
              icon={<Truck className="h-5 w-5" />}
            />
          </div>

          {/* Toolbar */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between mb-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search by quotation no. or client…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 h-9 text-xs bg-background/50 border-border focus-visible:ring-primary text-foreground"
                />
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Input 
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-9 text-xs w-32.5 bg-background/50 text-muted-foreground"
                />
                <span className="text-muted-foreground text-xs">—</span>
                <Input 
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="h-9 text-xs w-32.5 bg-background/50 text-muted-foreground"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                variant="outline" size="icon"
                onClick={handleBulkDownload}
                disabled={selected.size === 0 || downloading}
                className="h-9 w-9 border-border text-muted-foreground hover:bg-muted hover:text-foreground transition rounded-full"
                title="Download Selected PDFs"
              >
                <Download className={`h-4 w-4 ${downloading ? "animate-bounce" : ""}`} />
              </Button>
              <Button
                variant="outline" size="icon"
                onClick={handleBulkDelete}
                disabled={selected.size === 0 || deleting}
                className="h-9 w-9 border-destructive/20 text-destructive/60 hover:bg-destructive/10 hover:text-destructive transition rounded-full mr-2"
                title="Delete Selected"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={fetchQuotations}
                className="h-9 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRefetching || loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive mb-4">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={fetchQuotations} className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10">Retry</Button>
            </div>
          )}

          {/* Table */}
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="w-12 p-2">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-sm py-2">Q.NO</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-sm py-2">DATE</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-sm py-2">CLIENT NAME</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 text-right">GR WT</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 text-right">NET WT</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 text-center">ACTION</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 text-center">DISPATCH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className={`text-muted-foreground border-border transition-opacity duration-300 ${isRefetching ? "opacity-50 pointer-events-none" : ""}`}>
                  {/* Loading skeleton */}
                  {loading && Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-border animate-pulse">
                      <TableCell className="p-2"><div className="h-4 w-4 bg-muted rounded" /></TableCell>
                      <TableCell><div className="h-3 w-20 bg-muted rounded font-mono" /></TableCell>
                      <TableCell><div className="h-3 w-32 bg-muted rounded" /></TableCell>
                      <TableCell><div className="h-3 w-40 bg-muted rounded" /></TableCell>
                      <TableCell><div className="h-3 w-16 bg-muted rounded ml-auto" /></TableCell>
                      <TableCell><div className="h-3 w-16 bg-muted rounded ml-auto" /></TableCell>
                      <TableCell><div className="h-3 w-8 bg-muted rounded mx-auto" /></TableCell>
                      <TableCell><div className="h-7 w-8 bg-muted rounded mx-auto" /></TableCell>
                    </TableRow>
                  ))}

                  {/* Real rows */}
                  {!loading && quotations.map((q, i) => (
                    <TableRow
                      key={q._id}
                      className={`border-border transition-all ${selected.has(q._id) ? "bg-primary/5" : "hover:bg-accent/20"}`}
                    >
                      <TableCell className="p-2">
                        <Checkbox
                          checked={selected.has(q._id)}
                          onCheckedChange={() => toggleOne(q._id)}
                          className="border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-primary tracking-wide">{q.quotationNo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">{fmt(q.createdAt)}</TableCell>
                      <TableCell>
                        <p className="text-sm font-semibold text-foreground truncate max-w-45">{q.companyName}</p>
                        {q.contactName && <p className="text-xs text-muted-foreground mt-0.5">{q.contactName}</p>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{(q.totalGrossWeight ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{(q.totalNetWeight ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => setViewingQuotation(q.quotationNo)}
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-full transition-all"
                          title={`View ${q.quotationNo}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2 cursor-pointer" onClick={() => toggleDispatch(q.quotationNo, q.isDispatched)}>
                          <Send className={`h-4 w-4 ${q.isDispatched ? "text-emerald-500" : "text-emerald-500/50"}`} />
                          <div className={`h-2 w-2 rounded-full ${q.isDispatched ? "bg-emerald-500" : "bg-destructive"}`} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Empty */}
                  {!loading && !error && quotations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-14 h-14 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center">
                            <FileText className="h-7 w-7 text-primary/50" />
                          </div>
                          <p className="text-sm font-medium text-foreground">No quotations yet</p>
                          <p className="text-xs text-muted-foreground">
                            {debouncedSearch ? `No results for "${debouncedSearch}"` : "Export your first quotation from the Sales tab"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between bg-card px-4 py-3 border border-border rounded-xl shadow-sm gap-3">
              <p className="text-xs text-muted-foreground">
                Page <span className="text-foreground font-semibold">{page}</span> of{" "}
                <span className="text-foreground font-semibold">{totalPages}</span>
                {total > 0 && <span> · {total.toLocaleString()} total</span>}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.max(p - 1, 1))}
                  disabled={page === 1 || loading}
                  className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages || loading}
                  className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {viewingQuotation && (
            <QuotationDetailModal 
              quotationNo={viewingQuotation} 
              onClose={() => setViewingQuotation(null)}
              onUpdated={fetchQuotations}
            />
          )}
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="shadow-[0_8px_30px_rgba(0,0,0,0.12)] border-border bg-card transition-all hover:border-primary/30 group">
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
          <h3 className="text-xl font-mono font-semibold text-foreground mt-1.5 tracking-tight group-hover:text-primary transition-colors">{value}</h3>
        </div>
        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
