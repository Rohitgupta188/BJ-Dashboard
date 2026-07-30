"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";
import Navbar from "@/components/layout/navbar";
import CatalogueView, { CatalogueItem } from "@/components/dashboard/catalogue-view";
import QuotationsView from "@/components/dashboard/quotations-view";
import SalesQuotationView from "@/components/dashboard/sales-quotation-view";
import OtherViews from "@/components/dashboard/other-views";
import CustomerView from "@/components/dashboard/customer-view";
import CartDrawer from "@/components/dashboard/cart-drawer";
import ProductsTableView from "@/components/dashboard/products-table-view";
import SettingsView from "@/components/dashboard/settings-view";
import { Loader2, Home, FileText, ScanLine, ScanBarcode, User, Settings, UserCheck, BookOpen } from "lucide-react";
import CatalogImportPage from "@/components/dashboard/import-product";
import { ScannerProvider, useScannerContext } from "@/components/scanner-provider";

interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: "admin" | "employee";
}

function DashboardContent() {
  const router = useRouter();
  const [activeTab, setActiveTab]   = useState("Quotations");
  const [cart, setCart]             = useState<CatalogueItem[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [user, setUser]             = useState<UserInfo | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);  // ← mobile sidebar
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Close sidebar when tab changes (mobile UX)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [activeTab]);

  // Load cart from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dashboard_cart");
      if (stored) {
        try { setCart(JSON.parse(stored)); } catch { /* ignore */ }
      }
      setCartLoaded(true);
    }
  }, []);

  // Persist cart
  useEffect(() => {
    if (cartLoaded && typeof window !== "undefined") {
      localStorage.setItem("dashboard_cart", JSON.stringify(cart));
    }
  }, [cart, cartLoaded]);

  const { lastScannedSku } = useScannerContext();

  // Auto-switch to Sales tab on scan (SSE push)
  useEffect(() => {
    if (lastScannedSku) setActiveTab("Sales");
  }, [lastScannedSku]);

  // Auto-switch to Sales tab if navigated back from the scanner page
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("scanSku")) {
        setActiveTab("Sales");
      }
    }
  }, []);

    // Global Fetch Interceptor for 401s
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      if (response.status === 401) {
        // Only redirect if we are not already on the login page (or trying to fetch auth/me itself inside a loop)
        const url = args[0] as string;
        if (!url.includes("/api/auth/me")) {
           router.push("/login");
        }
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) { router.push("/login"); return; }
        const json = await res.json();
        if (json.success && json.data?.user) {
          setUser(json.data.user);
        } else {
          router.push("/login");
        }
      } catch {
        router.push("/login");
      } finally {
        setIsLoadingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  };

  const handleToggleCart = (item: CatalogueItem) => {
    setCart(prev =>
      prev.some(c => c.designNumber === item.designNumber)
        ? prev.filter(c => c.designNumber !== item.designNumber)
        : [...prev, item]
    );
  };

  // ── Swipe to open sidebar ─────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const currentTouch = e.targetTouches[0].clientX;
    const diff = currentTouch - touchStart;

    // If swiped right from the left edge (started within 40px of left edge)
    if (diff > 50 && touchStart < 40) {
      setIsSidebarOpen(true);
      setTouchStart(null); // prevent multiple triggers
    }
  };

  const handleTouchEnd = () => {
    setTouchStart(null);
  };

  const renderActiveView = () => {
    switch (activeTab) {
      case "Products":
        return <ProductsTableView userRole={user?.role} />;
      case "Catalogue":
        return <CatalogueView cart={cart} onToggleCart={handleToggleCart} />;
      case "Quotations":
        return <QuotationsView />;
      case "Sales":
        return <SalesQuotationView />;
      case "Customer":
        return <CustomerView />;
      case "Import & Export":
        if (user?.role !== "admin") return <div>Unauthorized</div>;
        return <CatalogImportPage />;
      case "Settings":
        return <SettingsView />;
      default:
        return <OtherViews tabName={activeTab} />;
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Verifying Session…</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div 
        className="flex h-screen bg-background text-foreground font-sans overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Sidebar (hidden on mobile until hamburger tap or swipe) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          userRole={user?.role}
        />

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Navbar
            cartCount={cart.length}
            onCartClick={() => setIsCartOpen(true)}
            username={user?.username}
            userRole={user?.role}
            onLogout={handleLogout}
            onMenuClick={() => setIsSidebarOpen(true)}
          />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 pb-24 lg:pb-6">
            {renderActiveView()}
          </main>
        </div>

        {/* ── Global Mobile Bottom Navigation ── */}
        <div className="fixed -bottom-1.5 left-0 right-0 z-40 lg:hidden bg-card/95 backdrop-blur-2xl border-t border-border shadow-[0_-10px_40px_rgba(0,0,0,0.08)] px-2 ">
          <div className="flex items-center justify-between max-w-md mx-auto">
            <button onClick={() => setActiveTab("Quotations")} className={`flex flex-col items-center justify-center gap-1 p-2 min-w-16 transition-colors group ${activeTab === "Quotations" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <Home className="h-5.5 w-5.5 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Home</span>
            </button>
            
            <button onClick={() => setActiveTab("Catalogue")} className={`flex flex-col items-center justify-center gap-1 p-2 min-w-16 transition-colors group ${activeTab === "Catalogue" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <BookOpen className="h-5.5 w-5.5 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Catalog</span>
            </button>

            <button className="relative -top-5 flex flex-col items-center justify-center group" onClick={() => setActiveTab("Sales")}>
              <div className={`h-16 w-16 rounded-full text-primary-foreground shadow-[0_8px_20px_rgba(197,160,89,0.4)] flex items-center justify-center border-[5px] border-background group-hover:scale-105 transition-transform ${activeTab === "Sales" ? "bg-primary/80" : "bg-primary"}`}>
                <ScanLine className="h-6.5 w-6.5" strokeWidth={2.5} />
              </div>
              <span className={`text-[10px] font-bold mt-1 ${activeTab === "Sales" ? "text-primary/80" : "text-primary"}`}>Scan</span>
            </button>

            <button onClick={() => setActiveTab("Customer")} className={`flex flex-col items-center justify-center gap-1 p-2 min-w-16 transition-colors group ${activeTab === "Customer" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <UserCheck className="h-5.5 w-5.5 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Customer</span>
            </button>
            
            <button onClick={() => setActiveTab("Settings")} className={`flex flex-col items-center justify-center gap-1 p-2 min-w-16 transition-colors group ${activeTab === "Settings" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <User className="h-5.5 w-5.5 group-hover:scale-110 transition-transform" strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Profile</span>
            </button>
          </div>
        </div>
      </div>

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onRemoveItem={handleToggleCart}
        onClearCart={() => setCart([])}
        onCreateQuotation={() => {
          setIsCartOpen(false);
          setActiveTab("Quotations");
        }}
      />
    </TooltipProvider>
  );
}

export default function DivaDashboard() {
  return (
    <ScannerProvider>
      <DashboardContent />
    </ScannerProvider>
  );
}