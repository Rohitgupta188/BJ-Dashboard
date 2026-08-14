/**
 * types/product.ts — Sales scanner product & quotation line item types
 *
 * Previously defined inline in:
 * - src/components/dashboard/sales-quotation-view.tsx
 */

/** A single product as returned by /api/catalog/[sku] */
export interface Product {
  sku: string;
  designNumber: string;
  collectionLine?: string;
  itemType?: string;
  grossWeight?: number;
  netWeight?: number;
  stoneWeight?: number;
  metalPurity?: string;
  metalType?: string;
  isInstock?: boolean;
  storagePath?: string;
  imageUrl?: string;
}

/** One row in the active sales quotation */
export interface LineItem {
  product: Product;
  qty: number;
  addedAt: Date;
}

/** A scan event recorded in the scan history panel */
export interface HistoryEntry {
  sku: string;
  designNumber: string;
  scannedAt: Date;
}
