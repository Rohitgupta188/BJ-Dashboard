"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bluetooth, BluetoothConnected, Usb, Smartphone,
  Wifi, WifiOff, ChevronDown, ChevronUp, X,
  Loader2, AlertCircle, CheckCircle2,
  Radio, ExternalLink, QrCode
} from "lucide-react";
import type { Statuses } from "@/scanner";

interface BluetoothPanelProps {
  statuses: Statuses;
  adapterLabels: Record<string, string>;
  requestAdapterConnection: (id: string) => Promise<string>;
  disconnectAdapter: (id: string) => void;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ConnectedDevice {
  name: string;
  adapterId: string;
  connectedAt: Date;
}

type ConnectionState = "idle" | "connecting" | "connected" | "error";

// ── Component ──────────────────────────────────────────────────────────────────
export default function BluetoothPanel({
  statuses,
  adapterLabels,
  requestAdapterConnection,
  disconnectAdapter,
}: BluetoothPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [serialState, setSerialState] = useState<ConnectionState>("idle");
  const [serialError, setSerialError] = useState<string | null>(null);
  const [isSerialSupported, setIsSerialSupported] = useState(true);
  const [previousPorts, setPreviousPorts] = useState<number>(0);

  // Detect serial support
  useEffect(() => {
    setIsSerialSupported("serial" in navigator);
  }, []);

  // Show count of previously granted ports when panel opens.
  useEffect(() => {
    if (!open || !isSerialSupported) return;
    (navigator.serial as any).getPorts?.().then((ports: unknown[]) => {
      setPreviousPorts(ports.length);
    }).catch(() => { });
  }, [open, isSerialSupported]);

  // Serial status from adapter
  useEffect(() => {
    if (statuses.serial === "ready") {
      setSerialState("connected");
    } else if (statuses.serial === "connecting") {
      setSerialState("connecting");
    } else if (statuses.serial === "offline" && serialState === "connected") {
      setSerialState("idle");
      setConnectedDevices((prev) => prev.filter((d) => d.adapterId !== "serial"));
    }
  }, [statuses.serial, serialState]);

  // ── Connect serial ─────────────────────────────────────────────────────
  const connectSerial = async () => {
    setSerialError(null);
    setSerialState("connecting");
    try {
      const name = await requestAdapterConnection("serial");
      setSerialState("connected");
      setConnectedDevices((prev) => {
        const filtered = prev.filter((d) => d.adapterId !== "serial");
        return [
          ...filtered,
          { name, adapterId: "serial", connectedAt: new Date() },
        ];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "cancelled") {
        setSerialState("idle");
      } else {
        setSerialState("error");
        setSerialError(msg);
      }
    }
  };

  const disconnectSerial = () => {
    disconnectAdapter("serial");
    setSerialState("idle");
    setConnectedDevices((prev) => prev.filter((d) => d.adapterId !== "serial"));
  };

  // Phone adapter SSE status
  const phoneStatus = statuses.phone;

  return (
    <div className="border-t border-border bg-card/50 rounded-b-2xl">

      {/* ── Toggle bar ────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left group"
      >
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Bluetooth className="h-4 w-4 text-primary" />
            {connectedDevices.length > 0 && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-card" />
            )}
          </div>
          <span className="text-xs font-semibold text-foreground">
            Scanner Connections
          </span>
          {connectedDevices.length > 0 && (
            <span className="text-[10px] text-emerald-400 font-medium">
              {connectedDevices.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Quick status pills */}
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              serialState === "connected"
                ? "border-emerald-700/40 text-emerald-400"
                : "border-border text-muted-foreground/50"
            }`}
          >
            SPP
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              phoneStatus === "ready"
                ? "border-emerald-700/40 text-emerald-400"
                : "border-border text-muted-foreground/50"
            }`}
          >
            Phone
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* ── Expanded panel ────────────────────────────────────────────── */}
      {open && (
        <div className="px-5 pb-5 space-y-5">

          {/* ── Section 1: Serial / SPP ──────────────────────────────── */}
          <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Usb className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">
                USB / Bluetooth SPP (Serial Port)
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pair a Bluetooth scanner as <span className="font-mono text-foreground">SPP</span> device on Windows
              (Settings → Bluetooth → Add device). A COM port appears. Then click Connect.
            </p>

            {!isSerialSupported ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-700/30 bg-amber-900/10 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-300">
                  Web Serial API requires Google Chrome on desktop. Firefox and Safari are not supported.
                </p>
              </div>
            ) : (
              <>
                {/* Previously granted ports */}
                {previousPorts > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <BluetoothConnected className="h-3.5 w-3.5 text-primary/60" />
                    {previousPorts} previously paired port{previousPorts > 1 ? "s" : ""} available
                  </div>
                )}

                {/* Error */}
                {serialState === "error" && serialError && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-800/30 bg-red-900/10 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-300">{serialError}</p>
                  </div>
                )}

                {/* Connected device */}
                {serialState === "connected" && connectedDevices.find((d) => d.adapterId === "serial") ? (
                  <div className="flex items-center justify-between rounded-lg border border-emerald-700/30 bg-emerald-900/10 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <div>
                        <p className="text-xs font-semibold text-emerald-400">
                          {connectedDevices.find((d) => d.adapterId === "serial")?.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Connected · scan a barcode to test
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={disconnectSerial}
                      className="text-muted-foreground hover:text-destructive transition"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectSerial}
                    disabled={serialState === "connecting"}
                    className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition w-full justify-center"
                  >
                    {serialState === "connecting" ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…</>
                    ) : (
                      <><Bluetooth className="h-3.5 w-3.5" /> Connect Serial / SPP Device</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── Section 2: Phone Camera (Built-in) ──────────────────────── */}
          <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <p className="text-xs font-semibold text-foreground">
                  Phone Camera Scanner
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="flex-1 space-y-3">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Open the scanner directly on this device. No hardware needed.
                  Point the camera at any product QR — the product will be scanned instantly.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => router.push('/scan')}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
                  >
                    <QrCode className="h-4 w-4" />
                    Open Scanner
                    <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-70" />
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground/60 mt-4">
                  ✓ No app installation &nbsp;·&nbsp; ✓ Works on Chrome/Android &nbsp;·&nbsp; ✓ Hardware accelerated
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 3: HID Keyboard (Bluetooth HID app) ─────────── */}
          <div className="rounded-xl border border-border bg-background/40 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <p className="text-xs font-semibold text-foreground">
                Bluetooth HID (Phone as Keyboard)
              </p>
              <span className="text-[10px] text-primary/70 border border-primary/20 rounded-full px-2 py-0.5">
                Recommended for demos
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Install a free app on your Android phone that pairs it as a Bluetooth keyboard. When you scan a QR,
              the app types the SKU text directly to the laptop — the dashboard captures it automatically.
              No web APIs involved; works in any browser.
            </p>

            <div className="grid grid-cols-1 gap-2 text-[11px]">
              {[
                { name: "Bluetooth Keyboard & Mouse", note: "Android — pairs as HID keyboard" },
                { name: "QR & Barcode Scanner to PC", note: "Android — scan → sends via BT" },
                { name: "BlueInput", note: "Android — full BT HID keyboard mode" },
              ].map((app) => (
                <div
                  key={app.name}
                  className="flex items-start gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary/60 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">{app.name}</p>
                    <p className="text-muted-foreground">{app.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground/60">
              Steps: Install app → Enable Bluetooth on laptop → Pair phone → Open app → Scan QR → SKU appears in scanner input automatically
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
