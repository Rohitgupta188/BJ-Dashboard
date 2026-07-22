/**
 * scanner/adapters/serial.ts
 *
 * Web Serial API Adapter — covers:
 *   • USB barcode scanners (direct USB)
 *   • Bluetooth SPP scanners (paired → creates COM port → Web Serial reads it)
 *   • Any device that streams SKU lines over a serial/COM interface
 *
 * Browser requirement: Chrome 89+ on desktop (Windows / macOS / Linux).
 * This adapter does NOT auto-start — it requires an explicit user gesture
 * (clicking "Connect") because requestPort() must be called from a click.
 *
 * Usage flow:
 *   1. User clicks "Connect Serial / SPP" in the Bluetooth panel.
 *   2. Chrome shows its native port picker dialog.
 *   3. User selects the COM port (e.g. "Bluetooth SPP Dev B" or "COM3").
 *   4. Adapter opens the port, begins reading lines.
 *   5. Each complete line (terminated by \r, \n, or \r\n) is emitted as a SKU.
 */

import type {
  ScannerAdapter,
  ScanDispatch,
  StatusDispatch,
} from "../types";

// Extend the base interface with serial-specific methods.
export interface SerialAdapterInterface extends ScannerAdapter {
  isSupported(): boolean;
  requestConnection(): Promise<string>; // resolves with port display name
  disconnect(): void;
  getConnectedPortName(): string | null;
  getPreviousPorts(): Promise<SerialPortInfo[]>;
}

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
  bluetoothServiceClassId?: string | number;
}

export class SerialAdapter implements SerialAdapterInterface {
  readonly id = "serial";
  readonly label = "USB / Bluetooth SPP (Serial)";

  private onScanCb?: ScanDispatch;
  private onStatusCb?: StatusDispatch;
  private port: SerialPort | null = null;
  private stopReading = false;
  private connectedPortName: string | null = null;

  // ── ScannerAdapter.start ───────────────────────────────────────────────
  start(onScan: ScanDispatch, onStatus: StatusDispatch): void {
    this.onScanCb = onScan;
    this.onStatusCb = onStatus;
    onStatus("offline"); // not connected until user requests
  }

  stop(): void {
    this.stopReading = true;
    try { this.port?.close(); } catch { /* ignore */ }
    this.port = null;
    this.connectedPortName = null;
  }

  // ── Extended API ───────────────────────────────────────────────────────
  isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  getConnectedPortName(): string | null {
    return this.connectedPortName;
  }

  /**
   * Returns ports previously granted by the user (Chrome persists these).
   * Can be shown as "previously paired" in the UI without a user gesture.
   */
  async getPreviousPorts(): Promise<SerialPortInfo[]> {
    if (!this.isSupported()) return [];
    try {
      const ports: SerialPort[] = await (navigator.serial as any).getPorts();
      return ports.map((p) => p.getInfo?.() ?? {});
    } catch {
      return [];
    }
  }

  /**
   * Must be called from a user click event (browser security requirement).
   * Opens Chrome's native port picker → user selects device → starts reading.
   */
  async requestConnection(): Promise<string> {
    if (!this.isSupported()) {
      throw new Error(
        "Web Serial API is not supported in this browser. " +
        "Please use Google Chrome on desktop."
      );
    }

    this.onStatusCb?.("connecting");

    try {
      const port: SerialPort = await (navigator.serial as any).requestPort();
      await port.open({ baudRate: 9600 });

      this.stopReading = false;
      this.port = port;

      // Try to get a human-readable name for the port.
      const info = port.getInfo?.() ?? {};
      const name =
        (info as any).bluetoothServiceClassId
          ? "Bluetooth SPP"
          : (info as any).usbVendorId
          ? `USB Scanner (0x${((info as any).usbVendorId).toString(16).toUpperCase()})`
          : "Serial Device";

      this.connectedPortName = name;
      this.onStatusCb?.("ready");

      // Start the async read loop (non-blocking).
      this.readLoop(port).catch(() => {
        this.onStatusCb?.("offline");
        this.connectedPortName = null;
      });

      return name;
    } catch (err) {
      this.onStatusCb?.("offline");
      const msg = err instanceof Error ? err.message : String(err);
      // "NotFoundError" means user dismissed the picker — not a real error.
      if (msg.includes("No port selected") || msg.includes("NotFoundError")) {
        throw new Error("cancelled");
      }
      throw err;
    }
  }

  disconnect(): void {
    this.stop();
    this.onStatusCb?.("offline");
  }

  // ── Private read loop ──────────────────────────────────────────────────
  private async readLoop(port: SerialPort): Promise<void> {
    const decoder = new TextDecoderStream();
    port.readable!.pipeTo(decoder.writable as any);
    const reader = decoder.readable.getReader();

    let buffer = "";

    try {
      while (!this.stopReading) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;

        // Split on CR, LF, or CRLF (all common scanner terminations).
        const lines = buffer.split(/\r?\n|\r/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const sku = line.trim();
          if (sku) this.onScanCb?.(sku);
        }
      }
    } finally {
      try { reader.cancel(); } catch { /* ignore */ }
    }
  }
}
