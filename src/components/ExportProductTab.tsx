"use client";

import { useState } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";

type ExportType = "catalogue" | "instock";

export default function ExportProductTab() {
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleExport(type: ExportType) {
    setLoading(type);
    setError(null);

    try {
      const res = await fetch(`/api/catalog/export?type=${type}`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Export failed.");
        return;
      }

      // Trigger browser download
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const filename = res.headers.get("Content-Disposition")
        ?.split("filename=")[1]
        ?.replace(/"/g, "")
        ?? `BJ_${type.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      const a  = document.createElement("a");
      a.href   = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
          <FileDown size={28} className="text-primary" />
        </div>

        <h3 className="mb-2 font-serif text-lg text-primary">Export Product Data</h3>
        <p className="mb-8 text-sm text-muted-foreground">
          Downloads an Excel file with all columns — ready to edit and re-import.
        </p>

        <div className="space-y-3">
          <ExportButton
            label="Export Catalogue"
            hint="All CATALOGUE status products"
            loading={loading === "catalogue"}
            onClick={() => handleExport("catalogue")}
          />
          <ExportButton
            label="Export Instock"
            hint="All INSTOCK status products"
            loading={loading === "instock"}
            onClick={() => handleExport("instock")}
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}

function ExportButton({
  label,
  hint,
  loading,
  onClick,
}: {
  label: string;
  hint: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-5 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50 group"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {loading ? (
        <Loader2 size={16} className="text-primary animate-spin" />
      ) : (
        <Download size={16} className="text-primary group-hover:scale-110 transition-transform" />
      )}
    </button>
  );
}