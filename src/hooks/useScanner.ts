"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  ScannerManager,
  HIDAdapter,
  PhoneAdapter,
  type Statuses,
} from "@/scanner";
import { SerialAdapter } from "@/scanner/adapters/serial";

interface UseScannerReturn {
  /** Connection status per adapter ID */
  statuses: Statuses;
  /** Human-readable label per adapter ID */
  adapterLabels: Record<string, string>;
  /** Live HID partial keystrokes for visual feedback */
  currentInput: string;
  clearInput: () => void;
  /**
   * Connect a user-initiated adapter (e.g. "serial").
   * MUST be called from a user click event (browser security).
   * Resolves with a human-readable device name.
   */
  requestAdapterConnection: (adapterId: string) => Promise<string>;
  /** Disconnect a specific adapter. */
  disconnectAdapter: (adapterId: string) => void;
}

export function useScanner(onScan: (sku: string) => void): UseScannerReturn {
  const [statuses, setStatuses] = useState<Statuses>({});
  const [currentInput, setCurrentInput] = useState("");
  const [adapterLabels, setAdapterLabels] = useState<Record<string, string>>({});

  // Keep onScan stable without restarting the manager.
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Hold manager in a ref so requestAdapterConnection can reach it.
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
      .register(new HIDAdapter())   // Phase 1: HID keyboard (USB/BT scanners, phone HID apps)
      .register(new PhoneAdapter()) // Phase 2: Phone camera via /mobile-scanner (SSE over WiFi)
      .register(new SerialAdapter()); // Phase 3: USB serial or Bluetooth SPP (user-initiated)
    // ── Future: .register(new NFCAdapter()) ─────────────────────────────────

    managerRef.current = manager;
    setAdapterLabels(manager.getAdapterLabels());

    const unsubscribe = manager.onStatusChange(setStatuses);

    manager.start(
      (sku) => onScanRef.current(sku),
      (partial) => setCurrentInput(partial)
    );

    return () => {
      manager.stop();
      unsubscribe();
      managerRef.current = null;
    };
  }, []); // stable — created once per mount

  return {
    statuses,
    adapterLabels,
    currentInput,
    clearInput,
    requestAdapterConnection,
    disconnectAdapter,
  };
}
