"use client";

import React, { useEffect, useState } from "react";
import { Trash2, ShoppingBag, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CatalogueItem } from "./catalogue-view";
import { generateCatalogPDF } from "@/lib/pdf";
import { buildQuotationPDF } from "@/lib/pdf";
import { buildProductionPDF } from "@/lib/pdf";

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

  const handleDownloadPDF = async (template: "executive" | "sales" | "production") => {
    if (cart.length === 0) return;
    setIsGeneratingPDF(true);
    try {
      if (template === "executive") {
        await generateCatalogPDF({ items: cart });
      } else {
        const lineItems = cart.map(item => ({
          sku: item.sku,
          designNumber: item.designNumber,
          grossWeight: item.grossWeight,
          netWeight: item.netWeight !== undefined ? item.netWeight : item.grossWeight,
          metalPurity: item.metalPurity,
          metalType: item.metalType,
          imageUrl: item.imageUrl,
          itemType: item.itemType,
          qty: 1
        }));

        if (template === "production") {
          await buildProductionPDF({
            quotationNo: "CART-PDF",
            companyName: "",
            contactName: "",
            address: "",
            remarks: "",
            date: new Date().toLocaleDateString(),
            lineItems,
            logoBase64: null,
          });
        } else {
          await buildQuotationPDF({
            quotationNo: "CART-PDF",
            companyName: "",
            contactName: "",
            address: "",
            remarks: "",
            date: new Date().toLocaleDateString(),
            lineItems,
            logoBase64: null,
            withImages: true,
          });
        }
      }
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Check console for details.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    setMounted(true);
  }, [isOpen]);

  if (!mounted) return null;

  const totalItems = cart.length;
  const totalWeight = cart.reduce((sum, item) => sum + (item.grossWeight || 0), 0);

  const metalSummary = cart.reduce((acc: { [key: string]: number }, item) => {
    const key = item.metalType || "Other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:w-115 p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="font-serif text-lg font-bold uppercase tracking-wider text-foreground">
                Quotation Cart
              </SheetTitle>
              <SheetDescription className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mt-0.5">
                {totalItems} {totalItems === 1 ? "Item" : "Items"} Selected
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20">
              <div className="w-16 h-16 bg-muted/30 border border-border/80 rounded-2xl flex items-center justify-center mb-4 text-muted-foreground/60 shadow-[inset_0_0_15px_rgba(0,0,0,0.05)]">
                <ShoppingBag className="h-7 w-7" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-semibold text-foreground">Your cart is empty</p>
              <p className="text-xs text-muted-foreground/80 max-w-60 mt-1.5">
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
            cart.map((item, index) => (
              <div
                key={`${item.designNumber}-${index}`}
                className="group flex gap-4 p-3 bg-muted/20 border border-border/80 rounded-2xl hover:border-primary/30 transition-all duration-300 hover:bg-muted/30"
              >
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

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={onClearCart}
                className="flex-1 min-w-25 h-11 border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs font-semibold rounded-xl"
              >
                Clear Cart
              </Button>
              <Button
                type="button"
                disabled={isGeneratingPDF}
                onClick={() => handleDownloadPDF("executive")}
                className="flex-1 min-w-30 h-11 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_15px_rgba(197,160,89,0.3)] hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)]"
              >
                {isGeneratingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Executive PDF
              </Button>
              <Button
                type="button"
                disabled={isGeneratingPDF}
                onClick={() => handleDownloadPDF("sales")}
                className="flex-1 min-w-30 h-11 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_15px_rgba(197,160,89,0.3)] hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)]"
              >
                {isGeneratingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Sales PDF
              </Button>
              <Button
                type="button"
                disabled={isGeneratingPDF}
                onClick={() => handleDownloadPDF("production")}
                className="flex-1 min-w-30 h-11 bg-primary text-primary-foreground hover:bg-primary/95 text-[10px] font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_15px_rgba(197,160,89,0.3)] hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)]"
              >
                {isGeneratingPDF ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Production PDF
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
