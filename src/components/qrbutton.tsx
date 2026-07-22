"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, QrCode } from "lucide-react";

interface Props {
  sku: string;
  productName: string;
}

export default function QRButton({ sku, productName }: Props) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;

    // The QR code on the physical product label simply encodes the SKU.
    // The scan app camera reads this SKU and looks it up in the database.
    QRCode.toCanvas(canvasRef.current, sku, {
      width: 240,
      margin: 2,
      color: {
        dark: "#090A0E",
        light: "#F5EDD8",
      },
    });
  }, [open, sku]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-[#C5A059]/30 px-3 py-1.5 text-xs text-[#C5A059] transition hover:border-[#C5A059]/70 hover:bg-[#C5A059]/10"
      >
        <QrCode size={13} />
        QR
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-[#C5A059]/20 bg-[#111218] p-6 text-center shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-serif text-base text-[#C5A059]">Product QR Code</p>
              <button
                onClick={() => setOpen(false)}
                className="text-[#8A8678] hover:text-[#E9E4D8]"
              >
                <X size={16} />
              </button>
            </div>

            <canvas
              ref={canvasRef}
              className="mx-auto rounded-xl"
              style={{ maxWidth: "100%", height: "auto" }}
            />

            <p className="mt-3 text-xs text-[#8A8678]">SKU</p>
            <p className="font-mono text-sm font-semibold text-[#E9E4D8]">{sku}</p>
            <p className="mt-1 text-xs text-[#5C594E]">{productName}</p>
          </div>
        </div>
      )}
    </>
  );
}