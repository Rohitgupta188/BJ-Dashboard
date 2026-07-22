import type { Metadata } from "next";
import ScanNotifier from "./scan-notifier";

interface Props {
  params: Promise<{ sku: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sku } = await params;
  return {
    title: `Scanned — Brahammand Jewels`,
    description: `SKU ${sku} scanned successfully.`,
  };
}

/**
 * Phone scan page — intentionally minimal.
 *
 * This page is what the phone opens after scanning a QR code.
 * Its ONLY job is to notify the dashboard (via /api/scanner/push) so
 * the product appears there — exactly like a Bluetooth scanner sending
 * a keystroke to the PC it's paired with.
 *
 * The phone operator sees a confirmation; the product details are shown
 * on the employee's dashboard screen, not here.
 */
export default async function ScanPage({ params }: Props) {
  const { sku } = await params;

  return (
    <main className="min-h-screen bg-[#090A0E] flex items-center justify-center px-6">
      {/* Fire the push silently on mount */}
      <ScanNotifier sku={sku} />

      <div className="w-full max-w-xs text-center space-y-6">

        {/* Brand */}
        <div>
          <p className="font-serif text-xl tracking-wide text-[#C5A059]">
            Brahammand Jewels
          </p>
          <p className="mt-0.5 text-[10px] tracking-[0.25em] text-[#5C594E] uppercase">
            Sales Scanner
          </p>
        </div>

        {/* Success indicator */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-600/50 bg-emerald-900/20">
          <svg
            className="h-9 w-9 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-1">
          <p className="text-base font-semibold text-[#E9E4D8]">
            Sent to dashboard
          </p>
          <p className="text-xs text-[#8A8678]">
            Product details are now showing on the sales screen.
          </p>
        </div>

        {/* SKU pill */}
        <div className="inline-block rounded-full border border-[#1C1D24] bg-[#111218] px-4 py-2">
          <p className="text-[10px] uppercase tracking-widest text-[#5C594E]">SKU</p>
          <p className="font-mono text-sm font-semibold text-[#C5A059]">{sku}</p>
        </div>

        <p className="text-[10px] text-[#2E2C27] tracking-widest">
          you may now close this tab
        </p>
      </div>
    </main>
  );
}
