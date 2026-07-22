"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import {
  Scan, X, Clock, ChevronRight, Loader2, ShoppingCart,
  Trash2, FileDown, AlertTriangle, CheckCircle2,
  Wifi, WifiOff, Keyboard, CheckCircle,
} from "lucide-react";
import { useScannerContext } from "@/components/scanner-provider";
import BluetoothPanel from "@/components/dashboard/bluetooth-panel";
import type { AdapterStatus } from "@/scanner";
import QuotationExportModal from "@/components/dashboard/quotation-export-modal";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
  sku: string;
  designNumber: string;
  collectionLine?: string;
  itemType?: string;
  grossWeight?: number;
  netWeight?: number;
  stoneWeight?: number;
  metalPurity?: string;
  metalType?: string;
  isInstock?: boolean;
  storagePath?: string;
  imageUrl?: string;
}

interface LineItem {
  product: Product;
  qty: number;
  addedAt: Date;
}

interface HistoryEntry {
  sku: string;
  designNumber: string;
  scannedAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function buildImageUrl(p: Product): string | null {
  if (p.storagePath && process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT) {
    return `${process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/${p.storagePath}`;
  }
  return p.imageUrl ?? null;
}

// ── Status badge ───────────────────────────────────────────────────────────────
function AdapterBadge({ id, label, status }: { id: string; label: string; status: AdapterStatus | undefined }) {
  const s = status ?? "offline";
  const colours: Record<AdapterStatus, string> = {
    ready: "border-emerald-700/40 bg-emerald-900/15 text-emerald-400",
    connecting: "border-amber-700/40 bg-amber-900/15 text-amber-400",
    offline: "border-border bg-muted/20 text-muted-foreground",
  };
  const Icon = id === "hid" ? Keyboard : s === "ready" ? Wifi : WifiOff;
  const statusLabel: Record<AdapterStatus, string> = {
    ready: id === "hid" ? "Scanner Ready" : "Phone Live",
    connecting: "Connecting…",
    offline: id === "hid" ? "Listening" : "Phone Offline",
  };
  return (
    <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${colours[s]}`} title={label}>
      <Icon className="h-3 w-3" />
      {statusLabel[s]}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SalesQuotationView() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportedQNo, setExportedQNo] = useState<string | null>(null);

  // ── LocalStorage hydration ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sales_quotation_line_items");
      const storedH = localStorage.getItem("sales_quotation_history");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Array<{ product: Product; addedAt: string; qty?: number }>;
          setLineItems(parsed.map(i => ({ ...i, addedAt: new Date(i.addedAt), qty: i.qty ?? 1 })));
        } catch { /* ignore */ }
      }
      if (storedH) {
        try {
          const parsed = JSON.parse(storedH) as Array<{ sku: string; designNumber: string; scannedAt: string }>;
          setHistory(parsed.map(h => ({ ...h, scannedAt: new Date(h.scannedAt) })));
        } catch { /* ignore */ }
      }
      setLineItemsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (lineItemsLoaded) localStorage.setItem("sales_quotation_line_items", JSON.stringify(lineItems));
  }, [lineItems, lineItemsLoaded]);

  useEffect(() => {
    if (lineItemsLoaded) localStorage.setItem("sales_quotation_history", JSON.stringify(history));
  }, [history, lineItemsLoaded]);

  // ── Scanner context ────────────────────────────────────────────────────────
  const { statuses, adapterLabels, currentInput, clearInput, requestAdapterConnection, disconnectAdapter, lastScannedSku } = useScannerContext();

  // ── Fetch product ──────────────────────────────────────────────────────────
  const fetchProduct = useCallback(async (sku: string) => {
    if (!sku.trim()) return;
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(sku.trim())}`);
      if (!res.ok) { setNotFound(true); setProduct(null); return; }
      const json = await res.json();
      const item: Product = json.data;
      setProduct(item);
      setFlashKey(k => k + 1);
      setHistory(prev => [
        { sku: item.sku, designNumber: item.designNumber, scannedAt: new Date() },
        ...prev.filter(p => p.sku !== item.sku).slice(0, 9),
      ]);
    } catch {
      setNotFound(true);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (lastScannedSku?.sku) fetchProduct(lastScannedSku.sku);
  }, [lastScannedSku, fetchProduct]);

  // Handle URL query parameter for same-tab navigation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const scanSku = params.get("scanSku");
      if (scanSku) {
        fetchProduct(scanSku);
        // Clear the URL parameter so it doesn't refetch on refresh
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [fetchProduct]);

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = (e.target as HTMLInputElement).value.trim();
      if (val) { fetchProduct(val); clearInput(); }
    }
  };

  // ── Quotation helpers ──────────────────────────────────────────────────────
  const addToQuote = useCallback(() => {
    if (!product) return;
    setLineItems(prev => {
      const existingIdx = prev.findIndex(li => li.product.sku === product.sku);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], qty: next[existingIdx].qty + 1 };
        return next;
      }
      return [...prev, { product, qty: 1, addedAt: new Date() }];
    });
  }, [product]);

  const removeFromQuote = (sku: string) =>
    setLineItems(prev => prev.filter(li => li.product.sku !== sku));

  const totalQty = lineItems.reduce((s, li) => s + li.qty, 0);
  const totalGross = lineItems.reduce((s, li) => s + (li.product.grossWeight ?? 0) * li.qty, 0);
  const totalNet = lineItems.reduce((s, li) => s + (li.product.netWeight ?? 0) * li.qty, 0);

  // ── After export ───────────────────────────────────────────────────────────
  function handleExported(qNo: string) {
    setExportedQNo(qNo);
    setShowExportModal(false);
    setLineItems([]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row gap-5 flex-1">

        {/* ── Left: scanner + product ──────────────────────────────────────── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* Status bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-2.5 flex-1">
              <Scan className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Sales Quotation</p>
                <p className="text-[11px] text-muted-foreground">
                  Scan with a Bluetooth / USB scanner or{" "}
                  <a href="/scan" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                    open phone scanner
                  </a>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(adapterLabels).map(([id, label]) => (
                <AdapterBadge key={id} id={id} label={label} status={statuses[id]} />
              ))}
            </div>
          </div>

          {/* Scanner input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={currentInput}
                data-scanner-input="true"
                placeholder="Waiting for scanner… or type a SKU and press Enter"
                onChange={() => { }}
                onKeyDown={handleManualKeyDown}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/40 font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition"
              />
            </div>
            {currentInput && (
              <button type="button" onClick={clearInput} className="text-muted-foreground hover:text-foreground transition p-1">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Export success banner */}
          {exportedQNo && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-700/30 bg-emerald-900/10 px-4 py-3 text-sm">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-400 font-medium">Quotation <span className="font-mono">{exportedQNo}</span> exported & saved!</span>
              <button onClick={() => setExportedQNo(null)} className="ml-auto text-emerald-400/60 hover:text-emerald-400">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Product display */}
          {loading ? (
            <ProductPlaceholder>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Looking up product…</p>
            </ProductPlaceholder>
          ) : notFound ? (
            <ProductPlaceholder className="border-amber-700/30 bg-amber-900/10">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm font-medium text-amber-400">Product not found</p>
              <p className="text-xs text-muted-foreground">SKU not in catalog</p>
            </ProductPlaceholder>
          ) : product ? (
            <div
              key={flashKey}
              className="flex flex-col sm:flex-row gap-5 rounded-2xl border border-primary/30 bg-card p-5 shadow-[0_0_40px_-8px_rgba(197,160,89,0.2)]"
              style={{ animation: "fadeIn 0.35s ease" }}
            >
              {/* Image */}
              <div className="flex items-center justify-center rounded-xl border border-border bg-muted/10 overflow-hidden shrink-0 self-center sm:self-auto" style={{ width: 200, height: 200 }}>
                {buildImageUrl(product) ? (
                  <Image src={buildImageUrl(product)!} alt={product.designNumber} width={200} height={200} className="object-contain" priority />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground/30">
                    <span className="text-5xl">💎</span>
                    <span className="text-xs">No image</span>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 flex flex-col gap-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Design Number</p>
                    <p className="font-mono text-2xl font-bold text-foreground">{product.designNumber}</p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border mt-1 ${product.isInstock ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400" : "border-amber-700/30 bg-amber-900/20 text-amber-400"}`}>
                    {product.isInstock ? "In Stock" : "Catalogue"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                  <Spec label="SKU" value={product.sku} mono />
                  {product.collectionLine && <Spec label="Collection" value={product.collectionLine} />}
                  {product.itemType && <Spec label="Item Type" value={product.itemType} />}
                  {product.grossWeight && product.grossWeight > 0 && <Spec label="Gross Wt." value={`${product.grossWeight} g`} />}
                  {product.netWeight && product.netWeight > 0 && <Spec label="Net Wt." value={`${product.netWeight} g`} />}
                  {product.metalPurity && <Spec label="Purity" value={product.metalPurity} />}
                  {product.metalType && <Spec label="Metal" value={product.metalType} />}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={addToQuote}
                    className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Add to Quote
                  </button>
                  <button onClick={() => { setProduct(null); setNotFound(false); }} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition px-2 py-2">
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ProductPlaceholder>
              <div className="h-16 w-16 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-center">
                <Scan className="h-8 w-8 text-primary/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Ready to scan</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Use a Bluetooth / USB scanner, or open{" "}
                  <a href="/scan" target="_blank" rel="noopener noreferrer" className="text-primary font-mono text-[11px] underline-offset-2 hover:underline">
                    /scan
                  </a>{" "}on your phone.
                </p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => <span key={i} className="h-2 w-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />)}
              </div>
            </ProductPlaceholder>
          )}
        </div>

        {/* ── Right: quotation panel + history ────────────────────────────── */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-4">

          {/* Quotation builder */}
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quotation ({totalQty})
              </p>
              {lineItems.length > 0 && (
                <button onClick={() => setLineItems([])} className="text-[11px] text-muted-foreground hover:text-destructive transition">
                  Clear all
                </button>
              )}
            </div>

            {lineItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/50 text-center py-4">Scan items to build a quotation</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-65 overflow-y-auto pr-1">
                {lineItems.map((li, i) => (
                  <div key={li.product.sku} className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-2.5 py-2">
                    <span className="text-[10px] text-muted-foreground/50 w-4 shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs font-semibold text-foreground truncate">{li.product.designNumber}</p>
                      {li.product.grossWeight && li.product.grossWeight > 0 && (
                        <p className="text-[10px] text-muted-foreground">{li.product.grossWeight} g</p>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-primary mr-1 shrink-0">×{li.qty}</span>
                    <button onClick={() => removeFromQuote(li.product.sku)} className="text-muted-foreground/40 hover:text-destructive transition shrink-0">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {lineItems.length > 0 && (
              <>
                <div className="mt-2 pt-2 border-t border-border space-y-1">
                  <Row label="Gross Wt." value={`${totalGross.toFixed(2)} g`} />
                  <Row label="Net Wt." value={`${totalNet.toFixed(2)} g`} highlight />
                  <Row label="Items" value={String(totalQty)} />
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="mt-3 flex items-center justify-center gap-2 w-full rounded-xl bg-primary/10 border border-primary/30 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Export Quotation
                </button>
              </>
            )}
          </div>

          {/* Scan history */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                <Clock className="h-3.5 w-3.5" />
                Recent Scans
              </div>
              <div className="flex flex-col gap-1.5">
                {history.map((h, i) => (
                  <button
                    key={`${h.sku}-${i}`}
                    onClick={() => fetchProduct(h.sku)}
                    className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold text-foreground truncate">{h.designNumber}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {h.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bluetooth panel ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <BluetoothPanel
          statuses={statuses}
          adapterLabels={adapterLabels}
          requestAdapterConnection={requestAdapterConnection}
          disconnectAdapter={disconnectAdapter}
        />
      </div>

      {/* ── Export Modal ────────────────────────────────────────────────────── */}
      {showExportModal && (
        <QuotationExportModal
          lineItems={lineItems}
          onClose={() => setShowExportModal(false)}
          onExported={handleExported}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Spec({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function ProductPlaceholder({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 text-center gap-4 py-16 min-h-55 ${className}`}>
      {children}
    </div>
  );
}
