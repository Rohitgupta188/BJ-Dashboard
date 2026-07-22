"use client";

import { useState } from "react";
import ImportProductTab from "../ImportProductTab";
import ExportProductTab from "../ExportProductTab";
import ImportImagesTab  from "../ImportImagesTab";

type Tab = "import" | "export" | "images";

const TABS: { id: Tab; label: string }[] = [
  { id: "import", label: "Import Product Data" },
  { id: "export", label: "Export Product Data" },
  { id: "images", label: "Import Images"        },
];

export default function CatalogImportPage() {
  const [activeTab, setActiveTab] = useState<Tab>("import");

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 py-8 text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-wide text-primary">
          Catalog Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import products, export data, and upload product images.
        </p>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(197,160,89,0.3)]"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      {activeTab === "import" && <ImportProductTab />}
      {activeTab === "export" && <ExportProductTab />}
      {activeTab === "images" && <ImportImagesTab  />}
    </div>
  );
}