"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Scan, X, Clock, ChevronRight,
  Loader2, Keyboard, Smartphone, FileText, Plus,
  Trash2, ShoppingBag,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Product {
  sku: string;
  designNumber: string;
  collectionLine?: string;
  itemType?: string;
  grossWeight?: number;
  netWeight?: number;
  metalPurity?: string;
  metalType?: string;
  isInstock?: boolean;
  isCatalog?: boolean;
  storagePath?: string;
  imageUrl?: string;
}

interface QuoteItem extends Product {
  qty: number;
  addedAt: Date;
}

interface HistoryEntry {
  sku: string;
  designNumber: string;
  scannedAt: Date;
}

/**
 * SalesScanner
 *
 * THREE input modes (all active simultaneously):
 *
 * 1. HARDWARE SCANNER (HID/Bluetooth/USB)
 *    Scanner types the barcode as keyboard input → global keydown listener
 *    buffers chars and flushes on Enter or 200ms idle.
 *
 * 2. PHONE CAMERA (cross-device)
 *    Phone opens /scan → POST /api/scanner/push → SSE stream fires here.
 *    Product details fetched from /api/catalog/[sku] and shown instantly.
 *
 * 3. MANUAL SKU ENTRY
 *    Click the input, type a SKU, press Enter.
 *
 * After a product appears, employee clicks "Add to Quotation" to build a list,
 * then clicks "Create Quotation" to generate a PDF.
 */
export default function SalesScanner() {
  const router = useRouter();



  // ── HID / keyboard scanner ─────────────────────────────────────────────────
  const hidBuffer = useRef<string>("");
  const hidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hidInputRef = useRef<HTMLInputElement>(null);
  const [hidValue, setHidValue] = useState("");

  // ── Product display ────────────────────────────────────────────────────────
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [notFound, setNotFound] = useState<string | null>(null);

  // ── Scan history ───────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ── Quotation list ─────────────────────────────────────────────────────────
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [showQuote, setShowQuote] = useState(false);

  // ── Fetch product from catalog ─────────────────────────────────────────────
  const fetchProduct = useCallback(async (rawSku: string) => {
    const sku = rawSku.trim();
    if (!sku) return;

    setLoading(true);
    setNotFound(null);
    setHidValue("");
    hidBuffer.current = "";

    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(sku)}`);
      if (res.status === 404) {
        setNotFound(sku);
        setProduct(null);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const item: Product = json.data;
      setProduct(item);
      setFlashKey(k => k + 1);
      setHistory(prev => [
        { sku: item.sku, designNumber: item.designNumber, scannedAt: new Date() },
        ...prev.slice(0, 9),
      ]);
    } catch {
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── HID keyboard listener ──────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Return") {
        if (hidBuffer.current.trim()) {
          const sku = hidBuffer.current.trim();
          hidBuffer.current = "";
          if (hidTimer.current) clearTimeout(hidTimer.current);
          fetchProduct(sku);
        }
        return;
      }

      const active = document.activeElement;
      const isOurInput = active === hidInputRef.current;
      const isOtherInput = !isOurInput && (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      );
      if (isOtherInput) return;

      if (e.key.length === 1) {
        hidBuffer.current += e.key;
        setHidValue(hidBuffer.current);
        if (hidTimer.current) clearTimeout(hidTimer.current);
        hidTimer.current = setTimeout(() => {
          if (hidBuffer.current.trim()) fetchProduct(hidBuffer.current.trim());
        }, 200);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fetchProduct]);


  // ── Quotation helpers ──────────────────────────────────────────────────────
  const addToQuote = () => {
    if (!product) return;
    setQuoteItems(prev => {
      const idx = prev.findIndex(q => q.sku === product.sku);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
        return updated;
      }
      return [...prev, { ...product, qty: 1, addedAt: new Date() }];
    });
    setShowQuote(true);
  };

  const removeFromQuote = (sku: string) =>
    setQuoteItems(prev => prev.filter(q => q.sku !== sku));

  // ── Image URL ──────────────────────────────────────────────────────────────
  function getImageUrl(p: Product): string | null {
    if (p.storagePath && process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT) {
      return `${process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/${p.storagePath}`;
    }
    return p.imageUrl ?? null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-full">

      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">

        {/* Status / mode bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm shrink-0">
          <div className="flex items-center gap-2.5 flex-1">
            <Scan className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Sales Scanner</p>
              <p className="text-[11px] text-muted-foreground">
                Scan with Bluetooth/USB scanner or open phone camera
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* HID always active */}
            <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
              <Keyboard className="h-3 w-3" />
              Scanner Ready
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-900/15 px-3 py-1 text-[11px] font-medium text-emerald-400">
              <Smartphone className="h-3 w-3" />
              Phone Ready
            </div>
            <button
              onClick={() => router.push('/scan')}
              className="flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Open Scanner
            </button>
          </div>
        </div>

        {/* Manual input */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              ref={hidInputRef}
              type="text"
              value={hidValue}
              placeholder="Waiting for scanner… (or type SKU and press Enter)"
              readOnly
              onFocus={() => hidInputRef.current?.removeAttribute("readonly")}
              onKeyDown={e => {
                if (e.key === "Enter" && hidValue.trim()) {
                  fetchProduct(hidValue.trim());
                  setHidValue(""); hidBuffer.current = "";
                }
              }}
              onChange={e => { hidBuffer.current = e.target.value; setHidValue(e.target.value); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground/50 font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
          </div>
          {hidValue && (
            <button onClick={() => { setHidValue(""); hidBuffer.current = ""; }} className="text-muted-foreground hover:text-foreground transition p-1">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Product display */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center rounded-2xl border border-border bg-card min-h-70">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Looking up product…</p>
            </div>
          </div>
        ) : notFound ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-red-900/30 bg-red-900/10 text-center gap-3 min-h-70">
            <span className="text-4xl">❌</span>
            <div>
              <p className="font-semibold text-foreground">SKU not found</p>
              <p className="font-mono text-sm text-muted-foreground mt-1">{notFound}</p>
            </div>
            <button onClick={() => setNotFound(null)} className="text-xs text-muted-foreground hover:text-foreground mt-2">Dismiss</button>
          </div>
        ) : product ? (
          <div
            key={flashKey}
            className="flex-1 flex flex-col sm:flex-row gap-6 rounded-2xl border border-primary/30 bg-card p-6 shadow-[0_0_40px_-8px_rgba(197,160,89,0.2)]"
            style={{ animation: "fadeIn 0.3s ease" }}
          >
            {/* Image */}
            <div className="flex items-center justify-center rounded-xl border border-border bg-muted/10 overflow-hidden shrink-0" style={{ width: 220, height: 220 }}>
              {getImageUrl(product) ? (
                <Image src={getImageUrl(product)!} alt={product.designNumber} width={220} height={220} className="object-contain" priority />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground/30">
                  <span className="text-5xl">💎</span>
                  <span className="text-xs">No image</span>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Design Number</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{product.designNumber}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border mt-1 ${
                  product.isInstock
                    ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-400"
                    : "border-amber-700/30 bg-amber-900/20 text-amber-400"
                }`}>
                  {product.isInstock ? "In Stock" : "Catalogue"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <Spec label="SKU" value={product.sku} mono />
                {product.collectionLine && <Spec label="Collection" value={product.collectionLine} />}
                {product.itemType && <Spec label="Item Type" value={product.itemType} />}
                {product.grossWeight && product.grossWeight > 0 && <Spec label="Gross Wt." value={`${product.grossWeight} g`} />}
                {product.netWeight && product.netWeight > 0 && <Spec label="Net Wt." value={`${product.netWeight} g`} />}
                {product.metalPurity && <Spec label="Purity" value={product.metalPurity} />}
                {product.metalType && <Spec label="Metal" value={product.metalType} />}
              </div>

              <div className="flex items-center gap-3 mt-auto">
                <button
                  onClick={addToQuote}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add to Quotation
                </button>
                <button onClick={() => setProduct(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Idle state */
          <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 text-center gap-5 py-20 min-h-70">
            <div className="h-16 w-16 rounded-2xl border border-primary/20 bg-primary/5 flex items-center justify-center">
              <Scan className="h-8 w-8 text-primary/50" />
            </div>
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-foreground">Ready to scan</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                Use a Bluetooth/USB scanner or open the phone scanner — product details will appear here instantly.
              </p>
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <span key={i} className="h-2 w-2 rounded-full bg-primary/30 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Right sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 flex flex-col gap-4">

        {/* Quotation panel */}
        <div className="flex-1 rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <FileText className="h-4 w-4" />
              Quotation
              {quoteItems.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {quoteItems.reduce((s, q) => s + q.qty, 0)}
                </span>
              )}
            </div>
            {quoteItems.length > 0 && (
              <button onClick={() => setShowQuote(v => !v)} className="text-[10px] text-muted-foreground hover:text-foreground transition">
                {showQuote ? "Hide" : "Show"}
              </button>
            )}
          </div>

          {quoteItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 opacity-50">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Scan items, then add to quotation</p>
            </div>
          ) : showQuote ? (
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
              {quoteItems.map(q => (
                <div key={q.sku} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-semibold text-foreground truncate">{q.designNumber}</p>
                    <p className="text-[10px] text-muted-foreground">{q.metalPurity} • {q.itemType}</p>
                  </div>
                  <span className="text-xs font-bold text-primary shrink-0">×{q.qty}</span>
                  <button onClick={() => removeFromQuote(q.sku)} className="text-muted-foreground/40 hover:text-red-500 transition shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-xs text-muted-foreground opacity-70 py-2">
              {quoteItems.length} item{quoteItems.length !== 1 && "s"} — {quoteItems.reduce((s, q) => s + q.qty, 0)} pcs total
            </div>
          )}

          <button
            disabled={quoteItems.length === 0}
            onClick={() => alert(`Generating quotation for ${quoteItems.length} items…`)}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4" />
            Create Quotation
          </button>
        </div>

        {/* Recent scans */}
        {history.length > 0 && (
          <div className="rounded-xl border border-border bg-card/40 p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Recent Scans
            </div>
            {history.map((h, i) => (
              <button
                key={`${h.sku}-${i}`}
                onClick={() => fetchProduct(h.sku)}
                className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:bg-card/80 transition"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-foreground truncate">{h.designNumber}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {h.scannedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Spec cell ──────────────────────────────────────────────────────────────────
function Spec({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : "font-medium"}`}>{value}</p>
    </div>
  );
}
