"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Search, ChevronUp, SlidersHorizontal, ChevronLeft, ChevronRight, Loader2, AlertCircle, RefreshCw, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QRButton from "../qrbutton";

// ─── Types ────────────────────────────────────────────────────────────────────
// Matches the shape returned by app/api/catalog/route.ts, which mirrors ICatalog
export interface CatalogueItem {
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

interface CatalogApiResponse {
  data: CatalogueItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

// ─── Skeleton card for loading state ──────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card/65 flex flex-col overflow-hidden animate-pulse">
      <div className="aspect-square bg-muted/50" />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-3 bg-muted/60 rounded w-3/4 mx-auto" />
        <div className="h-2 bg-muted/40 rounded w-full mt-1" />
        <div className="h-2 bg-muted/40 rounded w-2/3" />
      </div>
      <div className="h-6 bg-muted/30 border-t border-border/40" />
    </div>
  );
}

interface CatalogueViewProps {
  cart: CatalogueItem[];
  onToggleCart: (item: CatalogueItem) => void;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CatalogueView({ cart = [], onToggleCart }: CatalogueViewProps) {
  console.log("Catalogue view Props", cart);
  
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "ALL" shows everything; otherwise maps straight to the itemStatus enum
  const [itemStatus, setItemStatus] = useState<"ALL" | "CATALOGUE" | "INSTOCK">("ALL");

  // Debounce search: wait 600 ms after user stops typing before fetching
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // reset to page 1 on new search
    }, 600);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Fetch from /api/catalog whenever page / search / status change
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: "25",
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (itemStatus !== "ALL") params.set("itemStatus", itemStatus);

      const res = await fetch(`/api/catalog?${params}`);
      const data: CatalogApiResponse = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setItems(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalItems(data.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load catalogue data.");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, itemStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <>
      {/* ── FILTERS ROW ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.15)] text-foreground">
        <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search by Design No…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs border-border text-foreground bg-background/50 hover:bg-background/80 focus-visible:ring-primary focus-visible:border-primary transition-all duration-300"
            />
          </div>
          {/* Item status selector */}
          <Select value={itemStatus} onValueChange={(v) => { setItemStatus(v as "ALL" | "CATALOGUE" | "INSTOCK"); setCurrentPage(1); }}>
            <SelectTrigger className="w-37.5 h-9 text-xs bg-muted/30 border-border text-foreground focus:ring-primary hover:bg-muted/50 transition-colors">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="CATALOGUE">Catalogue</SelectItem>
              <SelectItem value="INSTOCK">In Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Item count badge */}
          {!isLoading && totalItems > 0 && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-2.5 py-1 rounded-md border border-border">
              {totalItems.toLocaleString()} items
            </span>
          )}
          <Button
            variant="outline" size="icon"
            className="h-9 w-9 border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
            onClick={fetchData}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline" size="icon"
            className="h-9 w-9 border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── ERROR BANNER ────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-destructive text-sm mt-6">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not load catalog</p>
            <p className="text-xs mt-0.5 opacity-80">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={fetchData} className="ml-auto shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10">
            Retry
          </Button>
        </div>
      )}

      {/* ── PRODUCT GRID ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6 text-foreground mt-2 px-3 sm:px-6 lg:px-8">
        {/* Loading skeletons */}
        {isLoading && Array.from({ length: 15 }).map((_, i) => <SkeletonCard key={i} />)}

        {/* Real product cards */}
        {!isLoading && items.map((product, idx) => {
          const isInCart = cart.some((item) => item.designNumber === product.designNumber);
          console.log(" isInCart: ",isInCart);
          
          return (
            <Card
              key={`${product.designNumber}-${idx}`}
              className="group relative overflow-hidden border-border/60 bg-card/70 backdrop-blur-sm flex flex-col rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_40px_-12px_rgba(197,160,89,0.25)]"
            >
              {/* ── Image area */}
              <div className="relative aspect-square bg-muted/15 flex items-center justify-center p-3 overflow-hidden">
                {/* Floating Cart Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCart(product);
                  }}
                  className={`absolute bottom-3 right-3 z-10 p-2 rounded-lg border transition-all duration-300 shadow-md ${
                    isInCart
                      ? "bg-primary border-primary text-primary-foreground shadow-[0_0_12px_rgba(197,160,89,0.4)] hover:bg-primary/95 hover:scale-105"
                      : "bg-background/80 hover:bg-background border-border text-muted-foreground hover:text-primary hover:scale-115"
                  }`}
                  title={isInCart ? "Remove from Cart" : "Add to Cart"}
                >
                  <ShoppingCart className="h-4 w-4" strokeWidth={2} />
                </button>

                {/* Status badge — accounts for items that are in both lists at once */}


                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.designNumber}
                    className="object-contain max-h-full max-w-full transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="relative w-24 h-24 flex items-center justify-center rounded-2xl bg-linear-to-br from-primary/12 via-primary/3 to-transparent border border-primary/20 shadow-[inset_0_0_12px_rgba(197,160,89,0.08)] group-hover:border-primary/35 transition-colors duration-500">
                    <span className="text-4xl drop-shadow-[0_0_8px_rgba(197,160,89,0.4)] animate-pulse">💎</span>
                    <span className="absolute top-1.5 right-1.5 text-[10px] text-primary/60">✨</span>
                  </div>
                )}
              </div>

              {/* ── Details ── responsive flex-layout with no hardcoded layout breaks */}
              <CardContent className="p-3 text-center flex-1 flex flex-col justify-between gap-1.5">
                <p className="font-mono text-sm sm:text-base font-bold uppercase tracking-wider text-foreground truncate" title={product.designNumber}>
                  {product.designNumber}
                </p>
                <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground/80 font-medium">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <span>Gross: {product.grossWeight}g</span>
                    <span className="opacity-30">|</span>
                    <span>Purity: {product.metalPurity}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mt-0.5">
                    {product.metalType}
                  </p>
                </div>
                <div className="mt-2 flex justify-center">
                  <QRButton sku={product.sku} productName={product.designNumber} />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center mb-4">
              <span className="text-3xl">💎</span>
            </div>
            <p className="text-base font-serif font-semibold text-foreground mb-1">No items found</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              {debouncedSearch ? `No results for "${debouncedSearch}". Try a different search.` : "No products with images yet. Run the upload script first."}
            </p>
          </div>
        )}
      </div>

      {/* ── PAGINATION ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && !error && (
        <div className="flex items-center justify-between bg-card px-5 py-3.5 border border-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] mt-6">
          <p className="text-xs text-muted-foreground font-medium">
            Page <span className="text-foreground font-semibold">{currentPage}</span> of <span className="text-foreground font-semibold">{totalPages}</span>
            {totalItems > 0 && <span> · {totalItems.toLocaleString()} total</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || isLoading}
              className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-all"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>

            {/* Page number pills */}
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const pg = currentPage <= 3 ? i + 1
                  : currentPage >= totalPages - 2 ? totalPages - 4 + i
                    : currentPage - 2 + i;
                if (pg < 1 || pg > totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all duration-200 ${pg === currentPage
                      ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(197,160,89,0.3)]"
                      : "border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30"
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
              className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-all"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Loading spinner overlay for page changes (non-initial) */}
      {isLoading && items.length === 0 && !error && (
        <div className="flex items-center justify-center gap-3 py-6 text-muted-foreground text-sm mt-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Loading catalog…</span>
        </div>
      )}
    </>
  );
}