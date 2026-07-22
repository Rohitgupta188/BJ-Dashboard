"use client";

import React, { useEffect, useState } from "react";
import { X, Trash2, ShoppingBag, ArrowRight, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CatalogueItem } from "./catalogue-view";
import { generateCatalogPDF } from "@/lib/generate-pdf";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CatalogueItem[];
  onRemoveItem: (item: CatalogueItem) => void;
  onClearCart: () => void;
  onCreateQuotation?: () => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onRemoveItem,
  onClearCart,
  onCreateQuotation,
}: CartDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    if (cart.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      await generateCatalogPDF(cart);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };


  // Prevent background scrolling when cart is open
  useEffect(() => {
    setMounted(true);
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!mounted) return null;

  // Calculate totals
  const totalItems = cart.length;
  const totalWeight = cart.reduce((sum, item) => sum + (item.grossWeight || 0), 0);

  // Group by metal type for summary info
  const metalSummary = cart.reduce((acc: { [key: string]: number }, item) => {
    const key = item.metalType || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Cart Slider Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[460px] bg-card border-l border-border shadow-[0_0_50px_rgba(0,0,0,0.4)] z-50 flex flex-col transition-transform duration-300 ease-out transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold uppercase tracking-wider text-foreground">
                Quotation Cart
              </h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                {totalItems} {totalItems === 1 ? "Item" : "Items"} Selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="py-1 px-2.5 h-8 rounded-lg border border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary hover:text-amber-600 transition-all duration-200 flex items-center gap-1.5 text-xs font-semibold shadow-[0_2px_8px_rgba(197,160,89,0.08)] disabled:opacity-50"
                title="Download PDF"
              >
                {isGeneratingPDF ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span>PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-all duration-200"
              title="Close Drawer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Cart Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 bg-muted/30 border border-border/80 rounded-2xl flex items-center justify-center mb-4 text-muted-foreground/60 shadow-[inset_0_0_15px_rgba(0,0,0,0.05)]">
                <ShoppingBag className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-foreground">Your cart is empty</p>
              <p className="text-xs text-muted-foreground/80 max-w-[240px] mt-1.5">
                Browse the jewelry catalogue and select designs to add them to your quotation cart.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="mt-6 border-primary/30 text-primary hover:bg-primary/10 transition-all font-semibold"
              >
                Browse Catalogue
              </Button>
            </div>
          ) : (
            /* Cart Items List */
            cart.map((item, index) => (
              <div
                key={`${item.designNumber}-${index}`}
                className="group flex gap-4 p-3 bg-muted/20 border border-border/80 rounded-2xl hover:border-primary/30 transition-all duration-300 hover:bg-muted/30"
              >
                {/* Item Image */}
                <div className="w-20 h-20 bg-background/50 rounded-xl border border-border flex items-center justify-center p-2 shrink-0 relative overflow-hidden">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.designNumber}
                      className="object-contain max-h-full max-w-full transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-2xl drop-shadow-[0_0_5px_rgba(197,160,89,0.3)]">💎</span>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex-1 flex flex-col min-w-0 justify-between py-0.5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-sm font-bold uppercase tracking-wider text-foreground truncate">
                        {item.designNumber}
                      </p>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(item)}
                        className="text-muted-foreground/60 hover:text-destructive p-1 rounded-md hover:bg-destructive/10 transition-all shrink-0"
                        title="Remove from Cart"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-semibold mt-1">
                      {item.metalType} · {item.metalPurity}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-muted-foreground">
                      Gross Weight: <span className="font-semibold text-foreground">{item.grossWeight}g</span>
                    </p>
                    {item.netWeight && (
                      <p className="text-[11px] text-muted-foreground">
                        Net: <span className="font-semibold text-foreground">{item.netWeight}g</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer Summary */}
        {cart.length > 0 && (
          <div className="p-6 border-t border-border bg-muted/10 space-y-4">
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Designs Selected</span>
                <span className="font-semibold text-foreground">{totalItems}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">Total Metal Weight</span>
                <span className="font-semibold text-foreground font-mono">{totalWeight.toFixed(3)}g</span>
              </div>

              {/* Metal types breakdown */}
              {Object.keys(metalSummary).length > 0 && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {Object.entries(metalSummary).map(([metal, count]) => (
                    <span
                      key={metal}
                      className="text-[9px] font-semibold tracking-wider text-primary uppercase bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md"
                    >
                      {metal}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <Separator className="bg-border" />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClearCart}
                className="flex-1 h-11 border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs font-semibold rounded-xl"
              >
                Clear Cart
              </Button>
              {/* <Button
                type="button"
                onClick={onCreateQuotation}
                className="flex-2 h-11 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold uppercase tracking-wider rounded-xl shadow-[0_4px_15px_rgba(197,160,89,0.3)] hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)] flex items-center justify-center gap-1.5 transition-all"
              >
                Create Quotation <ArrowRight className="h-3.5 w-3.5" />
              </Button> */}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
