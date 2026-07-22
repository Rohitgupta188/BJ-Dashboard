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
import { Loader2 } from "lucide-react";
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
      <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
        {/* Sidebar (hidden on mobile until hamburger tap) */}
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

          <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
            {renderActiveView()}
          </main>
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