"use client";

import React from "react";
import { ShoppingCart, User } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface NavbarProps {
  cartCount?: number;
  onCartClick?: () => void;
}

export default function Navbar({ cartCount = 0, onCartClick }: NavbarProps) {
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 z-10 text-foreground shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
      <div className="flex flex-col">
        <h1 className="text-lg font-serif font-semibold tracking-widest text-primary uppercase leading-tight hover:text-amber-600">
          Brahammand Jewels
        </h1>
      </div>
      <div className="flex items-center gap-6">
        {/* Shopping Cart Indicator */}
        <div
          onClick={onCartClick}
          className="relative cursor-pointer text-muted-foreground hover:text-primary transition-all duration-300 hover:scale-105"
        >
          <ShoppingCart className="h-5 w-5" strokeWidth={1.75} />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2.5 bg-primary text-primary-foreground text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center font-bold shadow-[0_0_10px_rgba(197,160,89,0.3)] border border-background">
              {cartCount}
            </span>
          )}
        </div>
        <Separator orientation="vertical" className="h-6 bg-border" />
        {/* Profile/Account Section */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_12px_rgba(197,160,89,0.08)]">
            <User className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-left">
            <p className=" text-lg uppercase tracking-wider text-muted-foreground font-bold leading-none mb-0.5">BJ</p>
          </div>
        </div>
      </div>
    </header>
  );
}
