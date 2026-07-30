/**
 * scanner/adapters/hid.ts
 *
 * HID Keyboard Adapter
 *
 * Handles any device that behaves as a Bluetooth or USB HID keyboard —
 * which includes virtually all commercial barcode/QR scanners and apps
 * like "Bluetooth QR & Barcode to PC" that pair a phone as a keyboard.
 *
 * How it works:
 *   The scanner "types" the SKU characters very rapidly (typically >500
 *   char/sec), followed by an Enter keystroke.  We buffer characters from
 *   global keydown events and flush the buffer on Enter OR after 200 ms of
 *   silence (safety net for scanners that don't send Enter).
 *
 * Filtering:
 *   We skip events when a non-scanner <input> or <textarea> has focus so
 *   the adapter does not capture normal user typing.  A scanner-owned input
 *   can opt in by setting data-scanner-input="true".
 *
 * Status: always "ready" — the OS/BT stack handles pairing; the browser
 * just sees keystrokes.
 */

import type {
  ScannerAdapter,
  ScanDispatch,
  StatusDispatch,
  InputDispatch,
} from "../types";

export class HIDAdapter implements ScannerAdapter {
  readonly id = "hid";
  readonly label = "HID Keyboard / Bluetooth Scanner";

  private buffer = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private handler: ((e: KeyboardEvent) => void) | null = null;
  private lastKeyTime = 0;

  start(
    onScan: ScanDispatch,
    onStatus: StatusDispatch,
    onInput?: InputDispatch
  ): void {
    // HID is always ready — no async connection step required.
    onStatus("ready");

    const flush = () => {
      const sku = this.buffer.trim();
      this.buffer = "";
      onInput?.("");
      if (sku) onScan(sku);
    };

    this.handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Return") {
        if (this.timer) clearTimeout(this.timer);
        if (this.buffer.trim()) flush();
        return;
      }

      // Skip if a regular (non-scanner) input element is focused.
      const active = document.activeElement as HTMLElement | null;
      const isScannerInput = active?.dataset?.scannerInput === "true";
      const isOtherInput =
        !isScannerInput &&
        active &&
        (active.tagName === "INPUT" ||
         active.tagName === "TEXTAREA" ||
         active.tagName === "SELECT");

      if (isOtherInput) return;

      // Accept printable characters only.
      if (e.key.length !== 1) return;

      const now = performance.now();
      
      // If it's been more than 100ms since the last keystroke, we assume this is the 
      // START of a new sequence (either a human typing or a new scanner scan).
      if (now - this.lastKeyTime > 100) {
        this.buffer = ""; 
      }
      this.lastKeyTime = now;

      this.buffer += e.key;
      onInput?.(this.buffer);

      // Flush after 200 ms of silence.
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        // Only flush if it looks like a real scan (e.g. at least 3 characters)
        // or if we explicitly got an Enter key (handled above).
        // This prevents stray single-character human typing from triggering 404s.
        if (this.buffer.length >= 3) {
          flush();
        } else {
          this.buffer = "";
          onInput?.("");
        }
      }, 200);
    };

    window.addEventListener("keydown", this.handler);
  }

  stop(): void {
    if (this.handler) window.removeEventListener("keydown", this.handler);
    if (this.timer) clearTimeout(this.timer);
    this.handler = null;
    this.buffer = "";
  }
}
