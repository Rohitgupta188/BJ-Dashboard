"use client";

import { useEffect } from "react";

/**
 * ScanNotifier
 *
 * Invisible client component mounted on the phone's /scan/[sku] page.
 * On mount it fires a POST to /api/scanner/push which broadcasts the
 * SKU over SSE to every listening dashboard tab — exactly like a
 * Bluetooth scanner sending a barcode to the computer.
 */
export default function ScanNotifier({ sku }: { sku: string }) {
  useEffect(() => {
    if (!sku) return;

    fetch("/api/scanner/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku }),
    }).catch(() => {
      // Silent failure — the phone banner already shows "sent";
      // a network error here shouldn't break the page for the user.
    });
  }, [sku]);

  return null; // renders nothing
}
