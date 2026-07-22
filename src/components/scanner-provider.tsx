"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  ScannerManager,
  HIDAdapter,
  PhoneAdapter,
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
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const [statuses, setStatuses] = useState<Statuses>({});
  const [currentInput, setCurrentInput] = useState("");
  const [adapterLabels, setAdapterLabels] = useState<Record<string, string>>({});
  const [lastScannedSku, setLastScannedSku] = useState<{ sku: string; timestamp: number } | null>(null);

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
      .register(new HIDAdapter())
      .register(new PhoneAdapter())
      .register(new SerialAdapter());

    managerRef.current = manager;
    setAdapterLabels(manager.getAdapterLabels());

    const unsubscribe = manager.onStatusChange(setStatuses);

    manager.start(
      (sku) => setLastScannedSku({ sku, timestamp: Date.now() }),
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
