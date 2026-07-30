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
 *
 * Fix: Do NOT use pipeTo() — it locks port.readable and prevents port.close()
 * from working while the stream is active. Instead, call getReader() directly
 * on port.readable and store the reader reference so stop() can cancel it first
 * (releasing the lock), then close the port safely.
 */

import type {
  ScannerAdapter,
  ScanDispatch,
  StatusDispatch,
} from "../types";

// Global promise to synchronize port cleanup across React Fast Refresh (HMR).
// When a component unmounts, it begins an async teardown of the port.
// If the new component mounts and tries to connect before teardown finishes,
// it will wait for this promise.
let globalClosePromise: Promise<void> | null = null;

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

  /**
   * Reader is stored as a class member so stop() can cancel it directly.
   * Cancelling the reader releases the lock on port.readable, which is a
   * prerequisite for calling port.close() without throwing a locked-stream error.
   */
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  // ── ScannerAdapter.start ───────────────────────────────────────────────
  start(onScan: ScanDispatch, onStatus: StatusDispatch): void {
    this.onScanCb = onScan;
    this.onStatusCb = onStatus;
    onStatus("offline"); // not connected until user requests
  }

  stop(): void {
    this.stopReading = true;

    // Atomically capture and null both references before async work.
    // This prevents a second call to stop() or requestConnection() from
    // racing against the cleanup that hasn't finished yet.
    const reader = this.reader;
    const port   = this.port;
    this.reader           = null;
    this.port             = null;
    this.connectedPortName = null;

    // Chain: cancel reader → release lock → close port (all in order).
    const cancelDone = reader
      ? reader.cancel().catch(() => {/* ignore */})
      : Promise.resolve();

    globalClosePromise = cancelDone.then(() => {
      if (reader) { try { reader.releaseLock(); } catch { /* ignore */ } }
      if (port)   { try { port.close();         } catch { /* ignore */ } }
    }).catch(() => {}).finally(() => {
      globalClosePromise = null;
    });
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

    // Await any pending cleanup from a previous React hot-reload or disconnect.
    if (globalClosePromise) {
      await globalClosePromise;
    }

    // ── Guard: already connected ────────────────────────────────────────
    // If a port is open, return its name immediately instead of trying to
    // open it again (which throws "The port is already open").
    if (this.port !== null) {
      if (this.connectedPortName) return this.connectedPortName;
      // Port exists but lost its name — clean it up first.
      this.disconnect();
      // Wait long enough for reader.cancel() + port.close() to settle.
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    this.onStatusCb?.("connecting");

    try {
      const port: SerialPort = await (navigator.serial as any).requestPort();

      // The browser may return the same SerialPort object that was used in a
      // previous session (e.g. after a hot-reload or rapid reconnect).
      try {
        await port.open({ baudRate: 9600 });
      } catch (openErr) {
        const msg = openErr instanceof Error ? openErr.message : String(openErr);
        const lowerMsg = msg.toLowerCase();
        
        if (lowerMsg.includes("already open")) {
          // Port is already open from a previous session — proceed as normal.
        } else if (lowerMsg.includes("in progress")) {
          // A previous open() call is still running. Wait a bit for it to finish.
          await new Promise((r) => setTimeout(r, 500));
          if (!port.readable) {
            throw new Error("Port is stuck opening. Please refresh the page.");
          }
        } else if (lowerMsg.includes("networkerror") || lowerMsg.includes("failed to open")) {
          throw new Error(
            "Connection rejected by Windows. Ensure your scanner is in SPP Mode (scan the SPP barcode). " +
            "If it is in SPP mode, you likely selected the wrong port. Click Connect again and select the OTHER COM port."
          );
        } else {
          throw openErr; // unexpected error — surface it
        }
      }

      if (!port.readable) {
        throw new Error("Port opened but is not readable.");
      }

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
  /**
   * Reads directly from port.readable (not via pipeTo) so that:
   *  1. We hold a direct reference to the reader.
   *  2. stop() can call reader.cancel() to release the lock.
   *  3. port.close() can then succeed without a "locked stream" error.
   */
  private async readLoop(port: SerialPort): Promise<void> {
    // Acquire reader directly — do NOT use pipeTo() here.
    const reader = port.readable!.getReader();
    this.reader = reader;

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (!this.stopReading) {
        const { value, done } = await reader.read();
        if (done) break;

        // stream: true keeps multi-byte UTF-8 sequences intact across chunks.
        buffer += decoder.decode(value, { stream: true });

        // Split on CR, LF, or CRLF (all common scanner terminations).
        const lines = buffer.split(/\r?\n|\r/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const sku = line.trim();
          if (sku) this.onScanCb?.(sku);
        }
      }
    } finally {
      // Always release the lock — this is what allows port.close() to succeed.
      try { reader.cancel(); } catch { /* ignore */ }
      try { reader.releaseLock(); } catch { /* ignore */ }
      this.reader = null;
    }
  }
}
