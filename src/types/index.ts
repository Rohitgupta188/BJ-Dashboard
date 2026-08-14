/**
 * types/index.ts — Central re-export for all shared types
 *
 * Import from "@/types" instead of individual files:
 * @example import type { UserInfo, Customer, CatalogItem } from "@/types";
 */

export type { UserInfo } from "./user";
export type { CatalogItem, CatalogPagination, CatalogApiResponse } from "./catalog";
export type { Quotation, QuotationsResponse } from "./quotation";
export type { Customer, CustomersResponse } from "./customer";
export type { Product, LineItem, HistoryEntry } from "./product";
