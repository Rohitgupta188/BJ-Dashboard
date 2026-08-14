/**
 * types/customer.ts — Customer types
 *
 * Previously defined inline in:
 * - src/components/dashboard/customer-view.tsx
 */

export interface Customer {
  _id: string;
  name: string;
  email?: string;
  contactName: string;
  phone: string;
  address: string;
}

export interface CustomersResponse {
  customers: Customer[];
  total: number;
  page: number;
  pageSize: number;
}
