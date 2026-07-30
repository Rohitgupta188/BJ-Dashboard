"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Loader2, BatteryFull, BatteryWarning, BatteryMedium, Battery } from "lucide-react";
import { useScannerContext } from "@/components/scanner-provider";

const QRBox = ({ title, code, subtitle }: { title: string; code: string; subtitle?: string }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(code, {
      margin: 2,
      width: 200,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then(setDataUrl)
      .catch(console.error);
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-3 p-4 bg-white rounded-2xl border border-border shadow-sm">
      <div className="text-center">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      
      {dataUrl ? (
        <div className="relative w-36 h-36">
          <Image src={dataUrl} alt={title} fill className="object-contain" unoptimized />
        </div>
      ) : (
        <div className="w-36 h-36 flex items-center justify-center bg-slate-50 rounded-xl">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}
    </div>
  );
};

export default function ScannerSettings() {
  const { batteryStatus, rawLastScan } = useScannerContext();

  return (
    <div className="max-w-3xl space-y-8 pb-24 lg:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h3 className="text-lg font-serif font-semibold text-foreground">Scanner Settings</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Scan these configuration barcodes directly from the screen to program your hardware scanner.
        </p>
      </div>

      {/* Row 1: SPP Mode and Battery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">
            Connection Mode
          </h4>
          <QRBox 
            title="SPP Mode" 
            subtitle="Required for Dashboard integration"
            code="%%SpecCodeAB" 
          />
          <QRBox 
            title="HID Mode" 
            subtitle="Acts as a generic keyboard"
            code="%%SpecCodeAA" 
          />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">
            Diagnostics
          </h4>
          <QRBox 
            title="Battery Level" 
            subtitle="Scan for battery level"
            code="%%SpecCode15" 
          />
          
          {batteryStatus && (
            <div className="mt-4 flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <BatteryFull className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Scanner Battery</p>
                  <p className="text-sm font-semibold text-emerald-600">{batteryStatus}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Standby Modes */}
      <div className="space-y-3 pt-4">
        <h4 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          Standby Mode (Sleep)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <QRBox 
            title="5 Minutes" 
            code="%%SpecCode33" 
          />
          <QRBox 
            title="30 Minutes" 
            code="%%SpecCode35" 
          />
          <QRBox 
            title="Immediate" 
            code="%%SpecCode38" 
          />
        </div>
      </div>

      {/* Diagnostic Log */}
      <div className="pt-8 mt-8 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground pb-3">
          Hardware Diagnostics Log
        </h4>
        <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-emerald-400 overflow-x-auto shadow-inner">
          {rawLastScan ? (
            <div className="flex flex-col gap-1">
              <span className="text-slate-500">Last received hardware payload:</span>
              <span className="text-sm bg-slate-800 px-2 py-1 rounded inline-block mt-1 border border-slate-700/50">
                {rawLastScan}
              </span>
              <span className="text-slate-500 mt-2">Length: {rawLastScan.length} characters</span>
            </div>
          ) : (
            <span className="text-slate-500 italic">Waiting for scanner input...</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-2xl">
          If you scan the battery barcode and nothing appears here, it means your scanner model does not transmit its battery level to the host device via keystrokes. Instead, it may indicate battery status visually via LED flashes or audibly via beeps (check your scanner's user manual).
        </p>
      </div>
    </div>
  );
}
