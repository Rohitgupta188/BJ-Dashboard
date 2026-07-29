"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Search, Loader2, AlertCircle, RefreshCw,
  Trash2, Pencil, ChevronLeft, ChevronRight, X, CheckSquare
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ProductItem {
  designNumber: string;
  rfid: string;
  sku: string;
  itemStatus: "CATALOGUE" | "INSTOCK";
  isCatalog: boolean;
  isInstock: boolean;
  itemType?: string;
  grossWeight: number;
  netWeight?: number;
  collectionLine?: string;
  metalType: string;
  metalPurity: string;
  imageUrl: string;
}

interface ProductApiResponse {
  data: ProductItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

// ─── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
  product,
  onClose,
  onSave,
}: {
  product: ProductItem;
  onClose: () => void;
  onSave: (updated: Partial<ProductItem>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    itemType: product.itemType ?? "",
    grossWeight: String(product.grossWeight),
    netWeight: String(product.netWeight ?? ""),
    metalType: product.metalType,
    metalPurity: product.metalPurity,
    collectionLine: product.collectionLine ?? "",
    itemStatus: product.itemStatus,
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({
      itemType: form.itemType,
      grossWeight: parseFloat(form.grossWeight),
      netWeight: parseFloat(form.netWeight),
      metalType: form.metalType,
      metalPurity: form.metalPurity,
      collectionLine: form.collectionLine,
      itemStatus: form.itemStatus as "CATALOGUE" | "INSTOCK",
    });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Edit Product</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Item Type</label>
              <Input value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Status</label>
              <select
                value={form.itemStatus}
                onChange={e => setForm(f => ({ ...f, itemStatus: e.target.value as "CATALOGUE" | "INSTOCK" }))}
                className="mt-1 w-full h-9 rounded-lg border border-border bg-background text-sm px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="INSTOCK">In Stock</option>
                <option value="CATALOGUE">Catalogue</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Gross Weight (g)</label>
              <Input type="number" value={form.grossWeight} onChange={e => setForm(f => ({ ...f, grossWeight: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Net Weight (g)</label>
              <Input type="number" value={form.netWeight} onChange={e => setForm(f => ({ ...f, netWeight: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Metal Type</label>
              <Input value={form.metalType} onChange={e => setForm(f => ({ ...f, metalType: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Metal Purity</label>
              <Input value={form.metalPurity} onChange={e => setForm(f => ({ ...f, metalPurity: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wide">Collection Line</label>
              <Input value={form.collectionLine} onChange={e => setForm(f => ({ ...f, collectionLine: e.target.value }))}
                className="mt-1 h-9 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ProductsTableView({ userRole }: { userRole?: string }) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemStatus, setItemStatus] = useState<"ALL" | "CATALOGUE" | "INSTOCK">("ALL");
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [deletingSkus, setDeletingSkus] = useState<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 600);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: "20" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (itemStatus !== "ALL") params.set("itemStatus", itemStatus);

      const res = await fetch(`/api/catalog?${params}`);
      const data: ProductApiResponse = await res.json();

      if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);

      setItems(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to load products.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, itemStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Selection helpers
  const allSelected = items.length > 0 && items.every(i => selectedSkus.has(i.sku));
  const toggleAll = () => {
    if (allSelected) setSelectedSkus(new Set());
    else setSelectedSkus(new Set(items.map(i => i.sku)));
  };
  const toggleOne = (sku: string) => {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      next.has(sku) ? next.delete(sku) : next.add(sku);
      return next;
    });
  };

  // Delete selected
  async function deleteSelected() {
    if (selectedSkus.size === 0) return;
    if (!confirm(`Delete ${selectedSkus.size} product(s)? This cannot be undone.`)) return;

    const skuArr = Array.from(selectedSkus);
    setDeletingSkus(new Set(skuArr));
    try {
      await Promise.all(
        skuArr.map(sku => fetch(`/api/catalog/${encodeURIComponent(sku)}`, { method: "DELETE" }))
      );
      setSelectedSkus(new Set());
      fetchData();
    } catch {
      alert("Some deletions failed.");
    } finally {
      setDeletingSkus(new Set());
    }
  }

  // Delete single
  async function deleteSingle(sku: string) {
    if (!confirm("Delete this product?")) return;
    setDeletingSkus(new Set([sku]));
    try {
      await fetch(`/api/catalog/${encodeURIComponent(sku)}`, { method: "DELETE" });
      fetchData();
    } finally {
      setDeletingSkus(new Set());
    }
  }

  // Edit save
  async function handleEditSave(sku: string, updated: Partial<ProductItem>) {
    await fetch(`/api/catalog/${encodeURIComponent(sku)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    fetchData();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-card px-4 py-3 rounded-xl border border-border shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search Here"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs border-border text-foreground bg-background/50 focus-visible:ring-primary"
          />
        </div>

        {/* Right Controls Container */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto sm:flex-1">
          {/* Status filter */}
          <Select value={itemStatus} onValueChange={v => { setItemStatus(v as "ALL" | "CATALOGUE" | "INSTOCK"); setCurrentPage(1); }}>
            <SelectTrigger className="w-32 h-9 text-xs bg-muted/30 border-border text-foreground focus:ring-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="CATALOGUE">Catalogue</SelectItem>
              <SelectItem value="INSTOCK">In Stock</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            {/* Item count */}
            {!isLoading && totalItems > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-2.5 py-1 rounded-md border border-border hidden sm:inline-flex">
                {totalItems.toLocaleString()} items
              </span>
            )}

            {/* Delete selected (Admin only) */}
            {userRole === "admin" && (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteSelected}
                disabled={selectedSkus.size === 0}
                className="h-9 gap-1.5 text-xs border-destructive text-destructive hover:bg-destructive hover:text-white disabled:opacity-30 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">DELETE</span>
              </Button>
            )}

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              className="h-9 gap-1.5 text-xs border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">REFRESH</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
          <Button size="sm" variant="outline" onClick={fetchData} className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10">Retry</Button>
        </div>
      )}

      {/* ── Mobile Product Cards ────────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-3 pb-2">
        {/* Loading skeleton */}
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card p-4 rounded-xl border border-border flex gap-4 animate-pulse">
            <div className="h-16 w-16 bg-muted rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-muted rounded w-1/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
            <CheckSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p>No products found.</p>
            <p className="text-xs mt-1">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : "Import products to get started"}
            </p>
          </div>
        )}

        {/* Real Cards */}
        {!isLoading && items.map(product => {
          const isSelected = selectedSkus.has(product.sku);
          const isDeleting = deletingSkus.has(product.sku);
          return (
            <div
              key={product.sku}
              onClick={() => userRole === "admin" && toggleOne(product.sku)}
              className={`bg-card rounded-xl border overflow-hidden p-3 flex gap-3 shadow-sm transition-all ${isSelected ? "border-[#C5A059] ring-1 ring-[#C5A059]/20 bg-[#C5A059]/5" : "border-border"} ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
            >
              {/* Left image */}
              <div className="h-20 w-20 shrink-0 bg-muted/10 rounded-lg flex flex-col items-center justify-center border border-border overflow-hidden">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.designNumber}
                    className="object-cover h-full w-full"
                    loading="lazy"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span className="text-2xl">💎</span>
                )}
              </div>

              {/* Right details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-bold text-[#C5A059] truncate">{product.designNumber}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{product.sku}</p>
                  </div>
                  {userRole === "admin" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingProduct(product); }}
                        className="h-7 w-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center hover:bg-emerald-500/20"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSingle(product.sku); }}
                        disabled={isDeleting}
                        className="h-7 w-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-end justify-between mt-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground">{product.metalType || "—"} • {product.itemType || product.sku?.substring(0, 4)}</span>
                    <span className="text-[11px] font-medium text-foreground">G: {product.grossWeight?.toFixed(2) ?? "—"}</span>
                  </div>
                  <div className="flex flex-col items-end text-right">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Net Wt</span>
                    <span className="text-[14px] font-bold text-foreground">{product.netWeight?.toFixed(3) ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Table (Desktop) ─────────────────────────────────────────────────── */}
      <div className="hidden md:block bg-card rounded-xl border border-border shadow-sm overflow-hidden pb-4 md:pb-0 mb-20 md:mb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/20 border-b border-border">
              <TableRow className="hover:bg-transparent border-border">
                {userRole === "admin" && (
                  <TableHead className="w-12 p-2 pr-6">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </TableHead>
                )}
                <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">IMAGE</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-primary text-sm py-2 px-2 text-center">RFID TAG</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-primary text-sm py-2 px-2 text-center">DESIGN NO.</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">GR WT</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">NET WT</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">METAL TYPE</TableHead>
                <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">ITEM TYPE</TableHead>
                {userRole === "admin" && (
                  <TableHead className="font-semibold uppercase tracking-wider text-foreground text-sm py-2 px-2 text-center">ACTION</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Loading skeleton */}
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i} className="border-border animate-pulse">
                  {userRole === "admin" && (
                    <TableCell className="p-2 pr-6"><div className="h-4 w-4 bg-muted rounded" /></TableCell>
                  )}
                  <TableCell><div className="h-14 w-14 bg-muted rounded-lg" /></TableCell>
                  <TableCell><div className="h-3 w-24 bg-muted rounded" /></TableCell>
                  <TableCell><div className="h-3 w-24 bg-muted rounded" /></TableCell>
                  <TableCell><div className="h-3 w-12 bg-muted rounded mx-auto" /></TableCell>
                  <TableCell><div className="h-3 w-12 bg-muted rounded mx-auto" /></TableCell>
                  <TableCell><div className="h-3 w-10 bg-muted rounded mx-auto" /></TableCell>
                  <TableCell><div className="h-3 w-16 bg-muted rounded mx-auto" /></TableCell>
                  {userRole === "admin" && (
                    <TableCell><div className="h-7 w-16 bg-muted rounded mx-auto" /></TableCell>
                  )}
                </TableRow>
              ))}

              {/* Real rows */}
              {!isLoading && items.map((product) => {
                const isSelected = selectedSkus.has(product.sku);
                const isDeleting = deletingSkus.has(product.sku);
                return (
                  <TableRow
                    key={product.sku}
                    className={`border-border transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/20"} ${isDeleting ? "opacity-40" : ""}`}
                  >
                    {userRole === "admin" && (
                      <TableCell className="p-2 pr-6">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(product.sku)}
                          className="border-primary/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                      </TableCell>
                    )}
                    <TableCell className="px-2 text-center">
                      <div className="h-24 w-24 mx-auto rounded-lg border border-border bg-muted/10 overflow-hidden flex items-center justify-center">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.imageUrl}
                            alt={product.designNumber}
                            className="object-cover h-full w-full transition-transform hover:scale-105 duration-500"
                            loading="lazy"
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="text-3xl">💎</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 text-center">
                      <span className="font-mono text-base font-semibold text-primary">{product.rfid || product.sku}</span>
                    </TableCell>
                    <TableCell className="px-2 text-center">
                      <span className="font-mono text-base font-semibold text-primary">{product.designNumber}</span>
                    </TableCell>
                    <TableCell className="px-2 text-center font-mono text-base text-foreground">
                      {product.grossWeight?.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell className="px-2 text-center font-mono text-base text-primary font-semibold">
                      {product.netWeight?.toFixed(3) ?? "—"}
                    </TableCell>
                    <TableCell className="px-2 text-center text-base text-foreground font-medium">
                      {product.metalType || "—"}
                    </TableCell>
                    <TableCell className="px-2 text-center text-base text-foreground font-medium">
                      {product.itemType || product.sku?.substring(0, 4) || "—"}
                    </TableCell>
                    {userRole === "admin" && (
                      <TableCell className="px-2 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => deleteSingle(product.sku)}
                            disabled={isDeleting}
                            className="p-2 rounded-md text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setEditingProduct(product)}
                            className="p-2 rounded-md text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}

              {/* Empty state */}
              {!isLoading && !error && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={userRole === "admin" ? 9 : 7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center">
                        <CheckSquare className="h-7 w-7 text-primary/50" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No products found</p>
                      <p className="text-xs text-muted-foreground">
                        {debouncedSearch ? `No results for "${debouncedSearch}"` : "Import products to get started"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && !error && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-card px-4 py-3 border border-border rounded-xl shadow-sm gap-3">
          <p className="text-xs text-muted-foreground w-full sm:w-auto text-center sm:text-left">
            Page <span className="text-foreground font-semibold">{currentPage}</span> of{" "}
            <span className="text-foreground font-semibold">{totalPages}</span>
            {totalItems > 0 && <span className="hidden sm:inline"> · {totalItems.toLocaleString()} total</span>}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || isLoading}
              className="h-8 w-8 sm:w-auto p-0 sm:px-3 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> <span className="hidden sm:inline">Prev</span>
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
                if (pg < 1 || pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all ${pg === currentPage
                      ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(197,160,89,0.3)]"
                      : "border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      }`}
                  >
                    {pg}
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || isLoading}
              className="h-8 w-8 sm:w-auto p-0 sm:px-3 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40"
            >
              <span className="hidden sm:inline">Next</span> <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      {editingProduct && (
        <EditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={(updated) => handleEditSave(editingProduct.sku, updated)}
        />
      )}
    </div>
  );
}
