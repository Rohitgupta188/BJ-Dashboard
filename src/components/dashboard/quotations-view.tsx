"use client";

import React, { useState, useEffect, useCallback } from "react";
import SalesScanner from "@/components/dashboard/sales-scanner";
import {
  FileText, Layers, Grid, Search,
  RotateCcw, Eye,
  AlertCircle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

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

  const [search, setSearch]       = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [subTab, setSubTab]       = useState<"quotations" | "scanner">("quotations");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch
  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/quotations?${params}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: QuotationsResponse = await res.json();
      setQuotations(data.quotations ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to load quotations.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  // Stats derived from current page (summary)
  const totalGross = quotations.reduce((s, q) => s + (q.totalGrossWeight ?? 0), 0);
  const totalNet   = quotations.reduce((s, q) => s + (q.totalNetWeight   ?? 0), 0);

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
      {/* ── Sub-tab switcher ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/30 border border-border w-fit mb-4">
        {(["quotations", "scanner"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
              subTab === tab
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "scanner" ? "📲 Scanner" : "📋 Quotations"}
          </button>
        ))}
      </div>

      {/* ── Scanner ───────────────────────────────────────────────────────── */}
      {subTab === "scanner" && (
        <div className="mt-2" style={{ minHeight: 420 }}>
          <SalesScanner />
        </div>
      )}

      {/* ── Quotations ────────────────────────────────────────────────────── */}
      {subTab === "quotations" && (
        <>
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
              title="This Page"
              value={`${quotations.length} of ${total}`}
              icon={<FileText className="h-5 w-5" />}
            />
          </div>

          {/* Toolbar */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by quotation no. or client…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs bg-background/50 border-border focus-visible:ring-primary text-foreground"
              />
            </div>
            <Button
              variant="outline" size="sm"
              onClick={fetchQuotations}
              className="h-9 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
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
                    <TableHead className="w-12 p-4">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-[10px] py-4">Quotation ID</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-[10px] py-4">Date</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-primary text-[10px] py-4">Client / Company</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-[10px] py-4 text-right">Gross Wt</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-[10px] py-4 text-right">Net Wt</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-[10px] py-4 text-center">Items</TableHead>
                    <TableHead className="font-semibold uppercase tracking-wider text-foreground text-[10px] py-4 text-center">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-muted-foreground border-border">
                  {/* Loading skeleton */}
                  {loading && Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-border animate-pulse">
                      <TableCell className="p-4"><div className="h-4 w-4 bg-muted rounded" /></TableCell>
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
                      <TableCell className="p-4">
                        <Checkbox
                          checked={selected.has(q._id)}
                          onCheckedChange={() => toggleOne(q._id)}
                          className="border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-primary tracking-wide">{q.quotationNo}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{fmt(q.createdAt)}</TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold text-foreground truncate max-w-[180px]">{q.companyName}</p>
                        {q.contactName && <p className="text-[10px] text-muted-foreground">{q.contactName}</p>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium">{(q.totalGrossWeight ?? 0).toFixed(2)}g</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-primary">{(q.totalNetWeight ?? 0).toFixed(2)}g</TableCell>
                      <TableCell className="text-center text-xs font-mono text-foreground">{q.totalItems}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary border border-primary/20 rounded-lg shadow-sm transition-all"
                          title={`View ${q.quotationNo}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
        </>
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
