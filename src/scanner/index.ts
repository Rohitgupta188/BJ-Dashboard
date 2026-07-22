/**
 * scanner/index.ts — public barrel export
 *
 * Everything the rest of the app needs is exported from here.
 * Import paths never reach into scanner/adapters/ directly.
 */

export type { ScannerAdapter, AdapterStatus } from "./types";
export type { Statuses } from "./scanner-manager";
export { ScannerManager } from "./scanner-manager";
export { HIDAdapter } from "./adapters/hid";
export { PhoneAdapter } from "./adapters/phone";
export { SerialAdapter } from "./adapters/serial";
