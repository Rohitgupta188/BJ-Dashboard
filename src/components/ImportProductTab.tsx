"use client";

import { useRef, useState } from "react";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";

interface ImportResult {
    inserted: number;
    updated: number;
    skipped: number;
    errors: { rowNumber: number; sku: string; reason: string }[];
}

export default function ImportProductTab() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [isCatalogue, setIsCatalogue] = useState(false);
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        setResult(null);
        setError(null);
    }

    async function handleUpload() {
        if (!file) return;
        setUploading(true);
        setResult(null);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", isCatalogue ? "catalogue" : "instock");
            formData.append("replace", String(replaceExisting));

            const res = await fetch("/api/catalog/import", { method: "POST", body: formData });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error ?? "Import failed.");
                return;
            }

            setResult(data);
            setFile(null);
            if (fileRef.current) fileRef.current.value = "";
        } catch {
            setError("Network error. Check your connection.");
        } finally {
            setUploading(false);
        }
    }

    function downloadSampleExcel() {
        const sample = [
            {
                "RFID Tag": "RFID001",
                "SKU Number": "DZLR3387",
                "Design Number": "DZLR-54068",
                "Image Name": "DZLR-54068.jpg",
                "Item Status": "INSTOCK",
                "Item Type": "Ring",
                "Size": "",
                "Gross Weight": 5.234,
                "Net Weight": 4.891,
                "Collection Line": "Classic",
                "Item Category": "",
                "Metal Type": "Y",
                "Metal Purity": "18",
            },
        ];

        const ws = XLSX.utils.json_to_sheet(sample);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Products");
        ws["!cols"] = Array(13).fill({ wch: 16 });
        XLSX.writeFile(wb, "BJ_Import_Sample.xlsx");
    }

    return (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* ── Left: upload form ───────────────────────────────────────────── */}
            <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
                {/* Icon */}
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
                    <FileSpreadsheet size={36} className="text-primary" />
                </div>

                {/* Toggles */}
                <div className="flex w-full flex-col gap-4">
                    <Toggle
                        label="Catalogue Excel"
                        checked={isCatalogue}
                        onChange={setIsCatalogue}
                        hint={isCatalogue ? "Will import as CATALOGUE" : "Will import as INSTOCK"}
                    />
                    <Toggle
                        label="Replace Existing Data"
                        checked={replaceExisting}
                        onChange={setReplaceExisting}
                        hint={replaceExisting ? "Existing SKUs will be overwritten" : "Existing SKUs will be skipped"}
                    />
                </div>

                {/* File picker */}
                <div className="w-full">
                    <label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                        Excel File (.xlsx)
                    </label>
                    <div
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-background/50 px-4 py-3 transition hover:border-primary/60 hover:bg-background"
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload size={16} className="shrink-0 text-primary" />
                        <span className="text-sm text-muted-foreground">
                            {file ? file.name : "Choose file"}
                        </span>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="flex w-full items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {/* Upload button */}
                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="w-full rounded-full bg-linear-to-r from-primary to-primary/80 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_4px_16px_rgba(197,160,89,0.25)] transition hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)] disabled:opacity-40"
                >
                    {uploading ? "Importing…" : "Upload"}
                </button>

                {/* Result summary */}
                {result && (
                    <div className="w-full rounded-xl border border-primary/20 bg-background p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <CheckCircle2 size={15} className="text-emerald-500" />
                            <span className="text-sm font-medium text-foreground">Import complete</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <Stat label="Inserted" value={result.inserted} color="text-emerald-500" />
                            <Stat label="Updated" value={result.updated} color="text-blue-400" />
                            <Stat label="Skipped" value={result.skipped} color="text-muted-foreground" />
                        </div>
                        {result.errors.length > 0 && (
                            <div className="mt-3 border-t border-border pt-3">
                                <p className="mb-2 text-xs text-destructive">
                                    {result.errors.length} row(s) skipped due to errors:
                                </p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {result.errors.slice(0, 20).map((e, i) => (
                                        <p key={i} className="text-xs text-muted-foreground">
                                            Row {e.rowNumber} — {e.sku}: {e.reason}
                                        </p>
                                    ))}
                                    {result.errors.length > 20 && (
                                        <p className="text-xs text-muted-foreground">
                                            …and {result.errors.length - 20} more
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Right: mandatory columns + sample download ───────────────────── */}
            <div className="rounded-2xl border border-primary/20 bg-card p-6 sm:p-8 shadow-sm">
                <h3 className="mb-4 font-serif text-lg text-primary">Mandatory Excel Columns</h3>
                <div className="mb-6 space-y-2">
                    {[
                        "RFID Tag",
                        "SKU Number",
                        "Design Number",
                        "Image Name",
                        "Item Status",
                        "Item Type",
                        "Gross Weight",
                        "Net Weight",
                        "Metal Type",
                        "Metal Purity",
                    ].map((col) => (
                        <div
                            key={col}
                            className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 text-sm text-foreground border border-border"
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                            {col}
                        </div>
                    ))}
                </div>

                <p className="mb-4 text-xs text-muted-foreground">
                    Optional columns: Collection Line, Stone Weight, Image Name
                </p>

                <button
                    onClick={downloadSampleExcel}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-primary/30 py-2.5 text-sm text-primary transition hover:border-primary/70 hover:bg-primary/10"
                >
                    <Download size={15} />
                    Download Sample Excel
                </button>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Toggle({
    label,
    checked,
    onChange,
    hint,
}: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    hint: string;
}) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
            <button
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-primary" : "bg-border"}`}
            >
                <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
                />
            </button>
        </div>
    );
}

function Stat({
    label,
    value,
    color,
}: {
    label: string;
    value: number;
    color: string;
}) {
    return (
        <div className="rounded-lg bg-muted/20 px-2 py-3 border border-border">
            <p className={`text-xl font-semibold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
        </div>
    );
}