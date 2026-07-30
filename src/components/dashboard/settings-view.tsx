"use client";

import React, { useState } from "react";
import { User, ScanBarcode, Shield, Settings2, Database } from "lucide-react";
import UpdateProfile from "./settings/update-profile";
import ScannerSettings from "./settings/scanner-settings";

type SettingsTab = "General" | "Scanner Settings" | "Master Catalogue" | "Backup and Restore";

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("General");

  const tabs: { id: SettingsTab; icon: React.ElementType; label: string }[] = [
    { id: "Master Catalogue", icon: Database, label: "Master Catalogue" },
    { id: "General", icon: User, label: "General" },
    { id: "Scanner Settings", icon: ScanBarcode, label: "Scanner Settings" },
    { id: "Backup and Restore", icon: Shield, label: "Backup and Restore" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "General":
        return <UpdateProfile />;
      case "Scanner Settings":
        return <ScannerSettings />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 border border-dashed border-border rounded-2xl bg-card/30">
            <Settings2 className="h-10 w-10 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-serif font-semibold text-foreground">Coming Soon</h3>
            <p className="text-sm text-muted-foreground max-w-sm text-center mt-2">
              The {activeTab} module is currently under development. Check back later.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-full min-h-[calc(100vh-8rem)]">
      
      {/* Settings Sidebar */}
      <div className="w-full lg:w-64 shrink-0">
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm sticky top-6">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 px-3">
            Settings
          </h2>
          <nav className="flex flex-col gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              // Only General and Scanner Settings are currently active
              const isDisabled = tab.id === "Master Catalogue" || tab.id === "Backup and Restore";

              return (
                <button
                  key={tab.id}
                  onClick={() => !isDisabled && setActiveTab(tab.id)}
                  disabled={isDisabled}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : isDisabled
                      ? "text-muted-foreground/40 cursor-not-allowed"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : ""}`} />
                  <span className="flex-1 text-left">{tab.label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Settings Content Area */}
      <div className="flex-1 bg-card/30 border border-border/50 rounded-3xl p-6 lg:p-8">
        {renderContent()}
      </div>
      
    </div>
  );
}
