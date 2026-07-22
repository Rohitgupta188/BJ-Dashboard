/**
 * scanner/types.ts
 *
 * Shared types for the scanner adapter system.
 * Nothing here references any specific hardware.
 */

export type AdapterStatus = "ready" | "connecting" | "offline";

/**
 * ScanDispatch — the single callback every adapter fires.
 */
export type ScanDispatch = (sku: string) => void;

/**
 * StatusDispatch — called when an adapter's connection state changes.
 */
export type StatusDispatch = (status: AdapterStatus) => void;

/**
 * InputDispatch — called by adapters that accumulate characters
 * (e.g. HID), so the UI can show live keystroke feedback.
 */
export type InputDispatch = (partial: string) => void;

/**
 * ScannerAdapter — the one interface every input source must implement.
 *
 * Business logic above this interface has zero knowledge of the
 * underlying hardware or protocol. Whether the SKU came from a
 * Bluetooth HID scanner, a USB scanner, a phone camera, or an NFC
 * tap, the contract is identical: start() → onScan(sku).
 */
export interface ScannerAdapter {
  /** Stable identifier, e.g. "hid" or "phone" */
  readonly id: string;
  /** Human-readable label for UI status displays */
  readonly label: string;

  /**
   * Begin listening for scans.
   *
   * @param onScan    - called with the final, complete SKU string
   * @param onStatus  - called when connection state changes
   * @param onInput   - (optional) called with partial buffer for live feedback
   */
  start(
    onScan: ScanDispatch,
    onStatus: StatusDispatch,
    onInput?: InputDispatch
  ): void;

  /** Stop listening and release all resources. */
  stop(): void;
}
