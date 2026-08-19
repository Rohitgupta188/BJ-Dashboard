"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ReportsView() {
  // Format for date picker (YYYY-MM-DD)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (reportType: "quotation-summary" | "quotation-details" | "pending-images") => {
    setIsDownloading(reportType);
    setError(null);
    
    try {
      const url = new URL(`/api/reports/${reportType}`, window.location.origin);
      if (reportType !== "pending-images") {
        url.searchParams.set("startDate", startDate);
        url.searchParams.set("endDate", endDate);
      }

      const res = await fetch(url.toString(), {
        method: "GET",
      });

      if (!res.ok) {
        let msg = "Failed to download report.";
        try {
          const errData = await res.json();
          if (errData.error) msg = errData.error;
        } catch (e) {
          // fallback to text or status if JSON parse fails
          msg = `Error ${res.status}: ${res.statusText}`;
        }
        throw new Error(msg);
      }

      // Read filename from headers if possible
      let filename = `${reportType}.xlsx`;
      const disposition = res.headers.get("Content-Disposition");
      if (disposition && disposition.indexOf("filename=") !== -1) {
        const matches = /filename="([^"]+)"/.exec(disposition);
        if (matches && matches[1]) filename = matches[1];
      }

      // Trigger download
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An error occurred during download.");
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6 text-foreground pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h2 className="text-2xl font-serif font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" /> Reports
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Download operational and sales reports.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-2 bg-background p-1.5 rounded-lg border border-border">
            <Input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
            />
            <span className="text-muted-foreground text-sm">—</span>
            <Input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Quotation Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground/80 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Quotation:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quotation Wise Summary */}
            <div className="bg-card p-5 rounded-2xl border border-border flex flex-col justify-between items-start gap-4 hover:border-primary/30 transition-colors shadow-sm">
              <div>
                <h4 className="font-semibold text-foreground">Quotation Wise Summary</h4>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Date-wise summary tabs with individual quotation rows. Includes total weight and quantity aggregations.
                </p>
              </div>
              <Button 
                onClick={() => handleDownload("quotation-summary")}
                disabled={isDownloading !== null}
                className="w-full sm:w-auto mt-2"
                variant="default"
              >
                {isDownloading === "quotation-summary" ? "Generating..." : (
                  <><Download className="w-4 h-4 mr-2" /> Download</>
                )}
              </Button>
            </div>

            {/* Quotation Details */}
            <div className="bg-card p-5 rounded-2xl border border-border flex flex-col justify-between items-start gap-4 hover:border-primary/30 transition-colors shadow-sm">
              <div>
                <h4 className="font-semibold text-foreground">Quotation Details</h4>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Detailed line-item breakdown for all quotations in the selected date range.
                </p>
              </div>
              <Button 
                onClick={() => handleDownload("quotation-details")}
                disabled={isDownloading !== null}
                className="w-full sm:w-auto mt-2"
                variant="default"
              >
                {isDownloading === "quotation-details" ? "Generating..." : (
                  <><Download className="w-4 h-4 mr-2" /> Download</>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Products Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground/80 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Products:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pending Images */}
            <div className="bg-card p-5 rounded-2xl border border-border flex flex-col justify-between items-start gap-4 hover:border-primary/30 transition-colors shadow-sm">
              <div>
                <h4 className="font-semibold text-foreground">Pending Images</h4>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  All catalog products currently missing an image.
                </p>
                <div className="mt-2 text-xs font-medium text-amber-600 bg-amber-500/10 inline-block px-2 py-1 rounded">
                  Date range not applicable — includes all pending images.
                </div>
              </div>
              <Button 
                onClick={() => handleDownload("pending-images")}
                disabled={isDownloading !== null}
                className="w-full sm:w-auto mt-2"
                variant="outline"
              >
                {isDownloading === "pending-images" ? "Generating..." : (
                  <><Download className="w-4 h-4 mr-2" /> Download</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
