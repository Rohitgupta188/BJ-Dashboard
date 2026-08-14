/**
 * types/catalog.ts — Catalogue/product item types
 *
 * Previously duplicated in:
 * - src/components/dashboard/catalogue-view.tsx (CatalogueItem)
 * - src/components/dashboard/products-table-view.tsx (ProductItem)
 *
 * Both are structurally identical and now share this canonical definition.
 */

export interface CatalogItem {
  designNumber: string;
  rfid: string;
  sku: string;
  itemStatus: "CATALOGUE" | "INSTOCK";
  isCatalog: boolean;
  isInstock: boolean;
  itemType?: string;
  grossWeight: number;
  netWeight?: number;
  collectionLine?: string;
  metalType: string;
  metalPurity: string;
  imageUrl?: string;   // not required — items may not have an image yet
}

export interface CatalogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogApiResponse {
  data: CatalogItem[];
  pagination: CatalogPagination;
  error?: string;
}
