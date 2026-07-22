"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { customerSchema } from "@/lib/validation/customer.schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Customer {
  _id: string;
  name: string;
  email?: string;
  contactName: string;
  phone: string;
  address: string;
}

const PAGE_SIZE = 10;

const emptyForm = {
  name: "",
  email: "",
  contactName: "",
  phone: "",
  address: "",
};

export default function CustomerView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
      });
      console.log("Params: ",params);
      console.log("Params String: ",params.toString());
      
      const res = await fetch(`/api/customers?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load customers.");
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function openAddModal() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  }

  function openEditModal(customer: Customer) {
    setEditingId(customer._id);
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      contactName: customer.contactName,
      phone: customer.phone,
      address: customer.address,
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
  }

  async function handleSave() {
    const validation = customerSchema.safeParse(form);
    if (!validation.success) {
      const firstError =
        validation.error.issues[0]?.message ?? "Invalid form data";

      setFormError(firstError);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const url = editingId ? `/api/customers/${editingId}` : "/api/customers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validation.data),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save customer.");
      }

      setIsModalOpen(false);
      setPage(1);
      await fetchCustomers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this customer? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete customer.");
      await fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="bg-card p-4 rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.15)] flex flex-col sm:flex-row gap-4 items-center justify-between text-foreground">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 text-muted-foreground h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search Customers..."
            className="pl-9 bg-background/50 border-border focus-visible:ring-primary focus-visible:border-primary hover:bg-background/85 h-9 text-xs text-foreground transition-all duration-300"
          />
        </div>
        <Button
          onClick={openAddModal}
          className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-6 text-xs font-semibold rounded-lg shadow-[0_4px_16px_rgba(197,160,89,0.25)] transition-all duration-300"
        >
          Add Customer
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.15)] overflow-hidden text-foreground mt-6">
        <Table>
          <TableHeader className="bg-muted/20 border-b border-border">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Name</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Email</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Contact Name</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Phone No.</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4">Address</TableHead>
              <TableHead className="font-serif uppercase tracking-wider text-primary text-[10px] py-4 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-muted-foreground border-border">
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                  Loading customers…
                </TableCell>
              </TableRow>
            )}

            {!loading && error && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-xs text-destructive font-semibold">
                  {error}
                </TableCell>
              </TableRow>
            )}

            {!loading && !error && customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                  No customers yet. Add your first one above.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              !error &&
              customers.map((customer) => (
                <TableRow
                  key={customer._id}
                  className="hover:bg-accent/25 border-border transition-all duration-300"
                >
                  <TableCell className="font-medium text-foreground tracking-wide font-serif text-xs">
                    {customer.name}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {customer.email || "—"}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground text-xs">
                    {customer.contactName}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {customer.phone}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {customer.address}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(customer)}
                        className="h-8 w-8 text-primary hover:text-primary-foreground hover:bg-primary border border-primary/20 rounded-lg shadow-sm transition-all duration-300"
                        aria-label="Edit customer"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(customer._id)}
                        className="h-8 w-8 text-destructive hover:text-destructive-foreground hover:bg-destructive border border-destructive/20 rounded-lg shadow-sm transition-all duration-300"
                        aria-label="Delete customer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && !error && (
        <div className="flex items-center justify-between bg-card px-5 py-3.5 border border-border rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-xs text-muted-foreground mt-6">
          <p className="font-medium">
            Page <span className="text-foreground font-semibold">{page}</span> of <span className="text-foreground font-semibold">{totalPages}</span>
            {total > 0 && <span> · {total} total</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-all"
            >
              Prev
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((pg, i, arr) => {
                  const prev = arr[i - 1];
                  const showEllipsis = prev && pg - prev > 1;
                  return (
                    <React.Fragment key={pg}>
                      {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                      <button
                        onClick={() => setPage(pg)}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold transition-all duration-200 ${
                          pg === page
                            ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(197,160,89,0.3)]"
                            : "border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                        }`}
                      >
                        {pg}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 gap-1 text-xs border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 disabled:opacity-40 transition-all"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] text-foreground">
            <div className="mb-5 flex items-center justify-between border-b border-border/60 pb-3">
              <h2 className="font-serif text-lg text-primary font-semibold tracking-wide">
                {editingId ? "Edit Customer Atelier" : "Register Customer"}
              </h2>
              <button 
                onClick={closeModal} 
                className="text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-lg p-1.5 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <Field
                label="Name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Shreeji Jew Rajkot"
              />
              <Field
                label="Email"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
                placeholder="e.g. contact@example.com"
                type="email"
              />
              <Field
                label="Contact Name"
                value={form.contactName}
                onChange={(v) => setForm({ ...form, contactName: v })}
                placeholder="e.g. Shree Hari"
              />
              <Field
                label="Phone No."
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
                placeholder="e.g. 9824843314"
              />
              <Field
                label="Address"
                value={form.address}
                onChange={(v) => setForm({ ...form, address: v })}
                placeholder="e.g. Rajkot"
              />
            </div>

            {formError && <p className="mt-3 text-xs text-destructive font-semibold">{formError}</p>}

            <div className="mt-6 flex justify-end gap-3 border-t border-border/60 pt-4">
              <Button
                variant="outline"
                onClick={closeModal}
                disabled={saving}
                className="border-border text-muted-foreground hover:bg-accent hover:text-foreground h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground h-9 text-xs font-semibold rounded-lg shadow-sm"
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Register Customer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-background/50 border-border focus-visible:ring-primary focus-visible:border-primary text-xs"
      />
    </label>
  );
}