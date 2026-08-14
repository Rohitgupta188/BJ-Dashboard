/**
 * types/quotation.ts — Quotation types
 *
 * Previously defined inline in:
 * - src/components/dashboard/quotations-view.tsx
 */

export interface Quotation {
  _id: string;
  quotationNo: string;
  date: string;
  companyName: string;
  contactName: string;
  totalGrossWeight: number;
  totalNetWeight: number;
  totalItems: number;
  isDispatched: boolean;
  createdAt: string;
}

export interface QuotationsResponse {
  quotations: Quotation[];
  total: number;
  page: number;
  pageSize: number;
}
