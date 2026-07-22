"use client";

import React from "react";
import { ShoppingCart, User, Menu } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface NavbarProps {
  cartCount?: number;
  onCartClick?: () => void;
  username?: string;
  userRole?: "admin" | "employee";
  onLogout?: () => void;
  onMenuClick?: () => void;   // ← opens mobile sidebar
}

export default function Navbar({
  cartCount = 0,
  onCartClick,
  username,
  userRole,
  onLogout,
  onMenuClick,
}: NavbarProps) {
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-8 z-10 text-foreground shadow-[0_4px_20px_rgba(0,0,0,0.15)] shrink-0">
      {/* Left: hamburger + brand */}
      <div className="flex items-center gap-3">
        {/* Hamburger — only visible below lg breakpoint */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* Full brand on sm+ */}
        <h1 className="hidden sm:block text-lg font-serif font-semibold tracking-widest text-primary uppercase leading-tight hover:text-amber-600 transition-colors">
          Brahammand Jewels
        </h1>

        {/* Short brand on tiny screens */}
        <h1 className="sm:hidden text-base font-serif font-semibold tracking-widest text-primary uppercase leading-tight">
          BJ
        </h1>
      </div>

      {/* Right: cart + user */}
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Cart */}
        <div
          onClick={onCartClick}
          className="relative cursor-pointer text-muted-foreground hover:text-primary transition-all duration-300 hover:scale-105"
        >
          <ShoppingCart className="h-5 w-5" strokeWidth={1.75} />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2.5 bg-primary text-primary-foreground text-[9px] min-w-4.5 h-4.5 rounded-full flex items-center justify-center font-bold shadow-[0_0_10px_rgba(197,160,89,0.3)] border border-background px-0.5">
              {cartCount}
            </span>
          )}
        </div>

        <Separator orientation="vertical" className="h-6 bg-border hidden sm:block" />

        {/* User */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-[0_0_12px_rgba(197,160,89,0.08)] shrink-0">
            <User className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold leading-none mb-1">Session</p>
            <p className="text-xs font-semibold text-foreground leading-none">{username || "Guest"}</p>
            {userRole && (
              <span className={`mt-1 inline-block text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-sm leading-none ${
                userRole === "admin"
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted text-muted-foreground border border-border"
              }`}>
                {userRole}
              </span>
            )}
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              className="ml-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive px-2 py-1 rounded-lg border border-border hover:border-destructive/20 hover:bg-destructive/5 active:scale-95 transition-all duration-200"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
