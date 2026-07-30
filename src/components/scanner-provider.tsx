"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  ScannerManager,
  HIDAdapter,
  type Statuses,
} from "@/scanner";
import { SerialAdapter } from "@/scanner/adapters/serial";

interface ScannerContextValue {
  statuses: Statuses;
  adapterLabels: Record<string, string>;
  currentInput: string;
  clearInput: () => void;
  requestAdapterConnection: (adapterId: string) => Promise<string>;
  disconnectAdapter: (adapterId: string) => void;
  lastScannedSku: { sku: string; timestamp: number } | null;
  batteryStatus: string | null;
  rawLastScan: string | null;
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Statuses>({});
  const [currentInput, setCurrentInput] = useState("");
  const [adapterLabels, setAdapterLabels] = useState<Record<string, string>>({});
  const [lastScannedSku, setLastScannedSku] = useState<{ sku: string; timestamp: number } | null>(null);
  const [batteryStatus, setBatteryStatus] = useState<string | null>(null);
  const [rawLastScan, setRawLastScan] = useState<string | null>(null);

  const managerRef = useRef<ScannerManager | null>(null);

  const clearInput = useCallback(() => setCurrentInput(""), []);

  const requestAdapterConnection = useCallback(
    async (adapterId: string): Promise<string> => {
      if (!managerRef.current) throw new Error("Scanner manager not initialized.");
      return managerRef.current.requestAdapterConnection(adapterId);
    },
    []
  );

  const disconnectAdapter = useCallback((adapterId: string) => {
    managerRef.current?.disconnectAdapter(adapterId);
  }, []);

  useEffect(() => {
    const manager = new ScannerManager()
      .register(new HIDAdapter())    // Always-on: Bluetooth HID keyboard / USB scanner
      .register(new SerialAdapter()); // User-initiated: USB serial or Bluetooth SPP

    managerRef.current = manager;
    setAdapterLabels(manager.getAdapterLabels());

    const unsubscribe = manager.onStatusChange(setStatuses);

    manager.start(
      (sku) => {
        setRawLastScan(sku); // Capture exact hardware output for diagnostics
        
        // Intercept battery outputs (usually short strings with %, or containing bat/vol)
        const lowerSku = sku.toLowerCase();
        if ((sku.includes("%") && sku.length < 20) || lowerSku.includes("bat") || lowerSku.includes("vol") || lowerSku.includes("level")) {
          setBatteryStatus(sku);
          return; // Do not treat as a product SKU
        }
        setLastScannedSku({ sku, timestamp: Date.now() });
      },
      (partial) => setCurrentInput(partial)
    );

    return () => {
      manager.stop();
      unsubscribe();
      managerRef.current = null;
    };
  }, []);

  return (
    <ScannerContext.Provider
      value={{
        statuses,
        adapterLabels,
        currentInput,
        clearInput,
        requestAdapterConnection,
        disconnectAdapter,
        lastScannedSku,
        batteryStatus,
        rawLastScan,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
}

export function useScannerContext() {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error("useScannerContext must be used within a ScannerProvider");
  return ctx;
}
