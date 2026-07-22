"use client";

import React, { useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";
import Navbar from "@/components/layout/navbar";
import CatalogueView, { CatalogueItem } from "@/components/dashboard/catalogue-view";
import QuotationsView from "@/components/dashboard/quotations-view";
import OtherViews from "@/components/dashboard/other-views";
import CustomerView from "@/components/dashboard/customer-view";
import CartDrawer from "@/components/dashboard/cart-drawer";

export default function DivaDashboard() {
  const [activeTab, setActiveTab] = useState("Quotations");
  const [cart, setCart] = useState<CatalogueItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Handle toggling an item in and out of the cart
  const handleToggleCart = (item: CatalogueItem) => {
    setCart((prev) => {
      const exists = prev.some((c) => c.designNumber === item.designNumber);
      if (exists) {
        return prev.filter((c) => c.designNumber !== item.designNumber);
      } else {
        return [...prev, item];
      }
    });
  };

  const handleClearCart = () => {
    setCart([]);
  };

  console.log("Cart data: ",cart);
  
  // Determine active view content
  const renderActiveView = () => {
    switch (activeTab) {
      case "Products":
      case "Catalogue":
        return <CatalogueView cart={cart} onToggleCart={handleToggleCart} />;
      case "Quotations":
        return <QuotationsView />;
      case "Customer":
        return <CustomerView/>
      default:
        return <OtherViews tabName={activeTab} />;
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
        {/* --- SIDEBAR --- */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* --- MAIN CONTENT CONTAINER --- */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* --- NAVBAR --- */}
          <Navbar cartCount={cart.length} onCartClick={() => setIsCartOpen(true)} />

          {/* --- MAIN PAGE CONTENT --- */}
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {renderActiveView()}
          </main>
        </div>
      </div>

      {/* --- CART DRAWER PANEL --- */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onRemoveItem={handleToggleCart}
        onClearCart={handleClearCart}
        onCreateQuotation={() => {
          setIsCartOpen(false);
          setActiveTab("Quotations");
        }}
      />
    </TooltipProvider>
  );
}