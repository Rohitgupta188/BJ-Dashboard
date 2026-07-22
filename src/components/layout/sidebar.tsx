"use client";

import React from "react";
import { 
  LayoutDashboard, 
  Package, 
  Layers, 
  FileText, 
  Grid, 
  UserCheck, 
  PieChart, 
  Mail, 
  Settings, 
  ChevronLeft,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const sidebarItems = [
  { id: "Quotations", icon: FileText },
  { id: "Catalogue", icon: BookOpen },
  { id: "Products", icon: Package },
  { id: "Customer", icon: UserCheck },
  { id: "Audit", icon: PieChart },
  { id: "Messages", icon: Mail },
  { id: "Settings", icon: Settings },
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  return (
    <aside className="w-20 flex flex-col items-center justify-between border-r border-border bg-sidebar py-6 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col items-center gap-8 w-full">
        {/* --- LUXURY BRAND LOGO --- */}
        <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-linear-to-br from-primary/20 to-primary/5 border border-primary/30 shadow-[0_0_15px_rgba(197,160,89,0.15)] group cursor-pointer transition-all duration-300 hover:border-primary">
          <span className="font-serif font-semibold text-sm tracking-wider text-primary select-none group-hover:scale-105 transition-transform duration-300">BJ</span>
          <span className="absolute -top-1 -right-1.5 text-[8px] text-primary animate-pulse">✨</span>
        </div>
        <nav className="flex flex-col gap-2.5 w-full px-3">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <Tooltip key={item.id} delayDuration={100}>
                <TooltipTrigger asChild>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setActiveTab(item.id)}
                    className={`h-11 w-11 rounded-xl transition-all duration-300 relative ${
                      isActive 
                        ? "bg-primary/10 text-primary hover:bg-primary/15 border border-primary/30 shadow-[0_0_10px_rgba(197,160,89,0.1)]" 
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    }`}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary rounded-full" />
                    )}
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-popover text-popover-foreground border border-border shadow-xl font-medium text-xs">
                  {item.id}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </div>
      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-xl h-10 w-10">
        <ChevronLeft className="h-5 w-5" />
      </Button>
    </aside>
  );
}
