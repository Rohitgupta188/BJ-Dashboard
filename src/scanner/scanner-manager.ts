/**
 * scanner/scanner-manager.ts
 *
 * ScannerManager
 *
 * Orchestrates all registered adapters.  Provides a single unified
 * onScan callback to the application layer — the business logic never
 * needs to know which adapter produced the SKU.
 *
 * Usage:
 *   const manager = new ScannerManager()
 *     .register(new HIDAdapter())
 *     .register(new PhoneAdapter());
 *
 *   manager.onStatusChange((statuses) => setStatuses(statuses));
 *   manager.start((sku) => handleScan(sku));
 *   // ... later:
 *   manager.stop();
 *
 * Adding a new device in the future:
 *   .register(new USBAdapter())    // no other changes
 *   .register(new NFCAdapter())    // no other changes
 */

import type {
  ScannerAdapter,
  AdapterStatus,
  ScanDispatch,
  InputDispatch,
} from "./types";

export type Statuses = Record<string, AdapterStatus>;
export type StatusListener = (statuses: Statuses) => void;

export class ScannerManager {
  private adapters: ScannerAdapter[] = [];
  private statuses: Statuses = {};
  private statusListeners: StatusListener[] = [];

  // ── Builder ────────────────────────────────────────────────────────────
  register(adapter: ScannerAdapter): this {
    this.adapters.push(adapter);
    return this;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  start(onScan: ScanDispatch, onInput?: InputDispatch): void {
    for (const adapter of this.adapters) {
      adapter.start(
        onScan,
        (status) => this.updateStatus(adapter.id, status),
        onInput
      );
    }
  }

  stop(): void {
    for (const adapter of this.adapters) adapter.stop();
  }

  /**
   * Call from a user gesture (button click) for adapters that require
   * explicit connection, e.g. SerialAdapter.
   * Throws if the adapter doesn't support requestConnection().
   */
  async requestAdapterConnection(id: string): Promise<string> {
    const adapter = this.adapters.find((a) => a.id === id);
    if (!adapter) throw new Error(`No adapter registered with id "${id}"`);
    if (!("requestConnection" in adapter)) {
      throw new Error(`Adapter "${id}" does not support manual connection.`);
    }
    return (adapter as { requestConnection(): Promise<string> }).requestConnection();
  }

  /** Disconnect a specific adapter by id (if it supports disconnect()). */
  disconnectAdapter(id: string): void {
    const adapter = this.adapters.find((a) => a.id === id);
    if (adapter && "disconnect" in adapter) {
      (adapter as { disconnect(): void }).disconnect();
    }
  }

  /** Get raw adapter by id — useful for reading adapter-specific state. */
  getAdapter<T extends ScannerAdapter = ScannerAdapter>(id: string): T | undefined {
    return this.adapters.find((a) => a.id === id) as T | undefined;
  }

  // ── Status observation ─────────────────────────────────────────────────
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    // Return an unsubscribe function.
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  getStatuses(): Statuses {
    return { ...this.statuses };
  }

  // ── Adapter metadata (for UI) ──────────────────────────────────────────
  getAdapterLabels(): Record<string, string> {
    return Object.fromEntries(this.adapters.map((a) => [a.id, a.label]));
  }

  // ── Private ────────────────────────────────────────────────────────────
  private updateStatus(id: string, status: AdapterStatus): void {
    this.statuses = { ...this.statuses, [id]: status };
    for (const listener of this.statusListeners) {
      listener(this.statuses);
    }
  }
}
