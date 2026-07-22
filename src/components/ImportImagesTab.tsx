"use client";

import { useRef, useState } from "react";
import { ImageIcon, Upload, CheckCircle2, AlertCircle, X } from "lucide-react";

const BATCH_SIZE  = 10;
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

interface BatchResult {
  uploaded:   number;
  backfilled: number;
  unmatched:  number;
  results: {
    filename: string;
    status:   "uploaded" | "backfilled" | "unmatched" | "failed";
    matched?: number;
    error?:   string;
  }[];
}

interface Summary {
  uploaded:   number;
  backfilled: number;
  unmatched:  string[];
  failed:     string[];
}

export default function ImportImagesTab() {
  const fileRef                         = useRef<HTMLInputElement>(null);
  const [files, setFiles]               = useState<File[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState({ done: 0, total: 0 });
  const [summary, setSummary]           = useState<Summary | null>(null);
  const [error, setError]               = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const valid    = selected.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ALLOWED_EXT.includes(ext);
    });

    if (valid.length !== selected.length) {
      setError(`${selected.length - valid.length} unsupported file(s) removed. Allowed: ${ALLOWED_EXT.join(", ")}`);
    } else {
      setError(null);
    }

    setFiles(valid);
    setSummary(null);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setSummary(null);

    const totalBatches = Math.ceil(files.length / BATCH_SIZE);
    const accumulated: Summary = {
      uploaded:   0,
      backfilled: 0,
      unmatched:  [],
      failed:     [],
    };

    setProgress({ done: 0, total: files.length });

    for (let i = 0; i < totalBatches; i++) {
      const batch    = files.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      const formData = new FormData();
      batch.forEach((f) => formData.append("images", f));

      try {
        const res  = await fetch("/api/catalog/import-images", {
          method: "POST",
          body:   formData,
        });

        const data: BatchResult = await res.json();

        if (!res.ok) {
          setError((data as any).error ?? "Upload failed.");
          break;
        }

        accumulated.uploaded   += data.uploaded;
        accumulated.backfilled += data.backfilled;

        data.results.forEach((r) => {
          if (r.status === "unmatched") accumulated.unmatched.push(r.filename);
          if (r.status === "failed")    accumulated.failed.push(`${r.filename}: ${r.error}`);
        });

        setProgress((prev) => ({ ...prev, done: prev.done + batch.length }));
      } catch {
        setError("Network error on batch upload. Check your connection.");
        break;
      }
    }

    setSummary(accumulated);
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
  }

  const progressPct = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* ── Left: uploader ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/5">
          <ImageIcon size={36} className="text-primary" />
        </div>

        {/* Drop zone */}
        <div
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-background/50 px-6 py-10 text-center transition hover:border-primary/60 hover:bg-background"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={24} className="text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Click to select images</p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WEBP, GIF — multiple files supported
            </p>
          </div>
          {files.length > 0 && (
            <span className="mt-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </span>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ALLOWED_EXT.join(",")}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* File list preview */}
        {files.length > 0 && (
          <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg border border-border bg-background p-2">
            {files.slice(0, 50).map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md px-3 py-1.5 hover:bg-muted/50"
              >
                <span className="truncate text-xs text-muted-foreground">{f.name}</span>
                <button
                  onClick={() => removeFile(i)}
                  className="ml-2 shrink-0 text-muted-foreground hover:text-destructive transition"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {files.length > 50 && (
              <p className="text-center text-xs text-muted-foreground py-2">
                …and {files.length - 50} more
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="mb-2 flex justify-between text-xs font-medium text-muted-foreground">
              <span>Uploading…</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-linear-to-r from-primary to-primary/80 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          className="w-full rounded-full bg-linear-to-r from-primary to-primary/80 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_4px_16px_rgba(197,160,89,0.25)] transition hover:shadow-[0_6px_20px_rgba(197,160,89,0.4)] disabled:opacity-40"
        >
          {uploading ? `Uploading batch ${Math.ceil(progress.done / BATCH_SIZE) + 1} of ${Math.ceil(progress.total / BATCH_SIZE)}…` : "Upload Images"}
        </button>
      </div>

      {/* ── Right: summary + info ───────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        {summary ? (
          <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-500" />
              <span className="text-base font-medium text-foreground">Upload complete</span>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 text-center">
              <Stat label="Uploaded to Backblaze" value={summary.uploaded} color="text-emerald-500" />
              <Stat label="Backfilled to siblings" value={summary.backfilled} color="text-blue-500" />
            </div>

            {summary.unmatched.length > 0 && (
              <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="mb-2 text-xs font-semibold text-amber-600 dark:text-amber-500">
                  {summary.unmatched.length} image(s) uploaded but no matching product found:
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1 pl-1">
                  {summary.unmatched.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{f}</p>
                  ))}
                </div>
              </div>
            )}

            {summary.failed.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <p className="mb-2 text-xs font-semibold text-destructive">
                  {summary.failed.length} failed:
                </p>
                <div className="max-h-24 overflow-y-auto space-y-1 pl-1">
                  {summary.failed.map((f, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{f}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-primary/20 bg-card p-6 shadow-sm">
            <h3 className="mb-4 font-serif text-lg text-primary">How it works</h3>
            <div className="space-y-4">
              {[
                "Select one or more image files (JPG, PNG, WEBP).",
                "Files are uploaded in batches of 10 to ensure stability.",
                "Each image is matched to products by its filename (e.g., DZLR-54068.jpg).",
                "Sibling SKUs with the same design number are auto-backfilled with the same image.",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary border border-primary/20">
                    {i + 1}
                  </span>
                  <p className="text-sm text-muted-foreground pt-0.5 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-background border border-border px-3 py-4 shadow-xs">
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}