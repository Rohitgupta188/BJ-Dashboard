import type {
  ScannerAdapter,
  ScanDispatch,
  StatusDispatch,
} from "../types";

const STORAGE_KEY = "bj_pending_scan";

export class PhoneAdapter implements ScannerAdapter {
  readonly id = "phone";
  readonly label = "Phone Camera";

  private stopped = false;
  private storageHandler: ((e: StorageEvent) => void) | null = null;

  start(onScan: ScanDispatch, onStatus: StatusDispatch): void {
    this.stopped = false;
    onStatus("ready");

    this.storageHandler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const { sku, ts } = JSON.parse(e.newValue) as { sku: string; ts: number };
        if (sku && Date.now() - ts < 10_000) {
          onScan(sku);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        /* ignore malformed entries */
      }
    };

    window.addEventListener("storage", this.storageHandler);

    // Also check if there's a pending scan in the URL param on mount
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sku = params.get("scanSku");
      if (sku) {
        onScan(sku);
      }
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.storageHandler) {
      window.removeEventListener("storage", this.storageHandler);
      this.storageHandler = null;
    }
  }
}
