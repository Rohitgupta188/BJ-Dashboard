'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'bj_pending_scan';

type ScanStatus = 'idle' | 'scanning' | 'success' | 'not_found' | 'error';

interface Toast {
  key: number;
  message: string;
  status: 'success' | 'not_found' | 'error';
}

export default function ScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ sku: string; time: number } | null>(null);
  const detectorRef = useRef<any>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const toastKey = useRef(0);

  const addToast = useCallback((message: string, toastStatus: Toast['status']) => {
    const key = ++toastKey.current;
    setToasts(t => [...t, { key, message, status: toastStatus }]);
    setTimeout(() => setToasts(t => t.filter(x => x.key !== key)), 2500);
  }, []);

  const submitSku = useCallback(async (rawSku: string) => {
    let sku = rawSku.trim();

    // Extract SKU if it's a full URL
    if (sku.includes('/scan/')) {
      sku = sku.split('/scan/').pop()?.split('?')[0] ?? sku;
    }
    if (!sku) return;

    setStatus('scanning');
    try {
      // Lookup product to verify it exists
      const res = await fetch(`/api/catalog/${encodeURIComponent(sku)}`);

      if (res.status === 404) {
        setStatus('not_found');
        addToast(`SKU not found: ${sku}`, 'not_found');
        setTimeout(() => setStatus('idle'), 1200);
        return;
      }

      if (!res.ok) throw new Error(`${res.status}`);

      // Write SKU to localStorage — the PhoneAdapter on the dashboard picks this up
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ sku, ts: Date.now() }));

      setStatus('success');
      addToast(`Found! Navigating to dashboard…`, 'success');

      setTimeout(() => {
        router.push(`/?scanSku=${encodeURIComponent(sku)}`);
      }, 500);
    } catch {
      setStatus('error');
      addToast('Network error. Check connection.', 'error');
      setTimeout(() => setStatus('idle'), 1200);
    }
  }, [router, addToast]);

  const startScanLoop = useCallback(async () => {
    if (!videoRef.current) return;

    if ('BarcodeDetector' in window && !detectorRef.current) {
      try {
        const formats = await (window as any).BarcodeDetector.getSupportedFormats();
        detectorRef.current = new (window as any).BarcodeDetector({
          formats: formats.length > 0 ? formats : ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a'],
        });
      } catch {
        detectorRef.current = null;
      }
    }

    const tick = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      let sku: string | null = null;

      if (detectorRef.current) {
        try {
          const results = await detectorRef.current.detect(video);
          if (results.length > 0) sku = results[0].rawValue;
        } catch {
          detectorRef.current = null;
        }
      }

      if (!sku && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          try {
            const jsQR = (await import('jsqr')).default;
            const result = jsQR(imageData.data, imageData.width, imageData.height);
            if (result) sku = result.data;
          } catch { /* jsQR not available */ }
        }
      }

      if (sku) {
        const now = Date.now();
        const last = lastScannedRef.current;
        if (!last || last.sku !== sku || now - last.time >= 2000) {
          lastScannedRef.current = { sku, time: now };
          await submitSku(sku);
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
  }, [submitSku]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let mounted = true;

    async function initCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          if (!mounted) return;
          setCameraReady(true);
          startScanLoop();
        }
      } catch (err: any) {
        if (!mounted || err.name === 'AbortError') return;
        if (err.name === 'NotAllowedError') setCameraError('Camera permission denied. Please allow and reload.');
        else if (err.name === 'NotFoundError') setCameraError('No camera found on this device.');
        else setCameraError(`Camera error: ${err.message}`);
      }
    }

    initCamera();
    return () => {
      mounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [startScanLoop, facingMode]);

  const flashColor =
    status === 'success' ? 'rgba(34,197,94,0.35)' :
    status === 'not_found' || status === 'error' ? 'rgba(239,68,68,0.35)' :
    status === 'scanning' ? 'rgba(251,191,36,0.15)' :
    'transparent';

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Scan flash overlay */}
      <div style={{ position: 'absolute', inset: 0, background: flashColor, transition: 'background 0.15s ease', pointerEvents: 'none' }} />

      {/* Dark gradient */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 25%, transparent 72%, rgba(0,0,0,0.75) 100%)',
      }} />

      {/* Viewfinder corners */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {[
          { top: '25%', left: '15%', borderTop: '4px solid #fff', borderLeft: '4px solid #fff', borderTopLeftRadius: 8 },
          { top: '25%', right: '15%', borderTop: '4px solid #fff', borderRight: '4px solid #fff', borderTopRightRadius: 8 },
          { bottom: '25%', left: '15%', borderBottom: '4px solid #fff', borderLeft: '4px solid #fff', borderBottomLeftRadius: 8 },
          { bottom: '25%', right: '15%', borderBottom: '4px solid #fff', borderRight: '4px solid #fff', borderBottomRightRadius: 8 },
        ].map((s, i) => (
          <div key={i} style={{ position: 'absolute', width: 32, height: 32, ...s }} />
        ))}

        {cameraReady && (
          <div style={{
            position: 'absolute', left: '15%', right: '15%', height: 2,
            background: 'rgba(255,60,60,0.8)', boxShadow: '0 0 12px rgba(255,60,60,0.9)',
            animation: 'scanLine 2s infinite linear alternate',
          }}>
            <style>{`
              @keyframes scanLine {
                0%   { top: 25%; }
                100% { top: 75%; }
              }
            `}</style>
          </div>
        )}
      </div>

      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: '1.05rem', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
            Brahammand Jewels
          </div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', marginTop: 2, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Product Scanner
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 99, padding: '0.45rem 0.9rem', backdropFilter: 'blur(8px)' }}>
            {cameraReady && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />}
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{cameraReady ? 'Live' : 'Starting…'}</span>
          </div>
          <button
            onClick={() => setFacingMode(p => p === 'environment' ? 'user' : 'environment')}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99, color: '#fff', fontSize: '0.85rem', fontWeight: 600, padding: '0.45rem 0.9rem', cursor: 'pointer', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
          >
            🔄 Flip
          </button>
          <button
            onClick={() => router.push('/')}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 99, color: '#fff', fontSize: '0.85rem', fontWeight: 600, padding: '0.45rem 0.9rem', cursor: 'pointer', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
          >
            ← Dashboard
          </button>
        </div>
      </div>

      {/* Camera error */}
      {cameraError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'rgba(0,0,0,0.9)' }}>
          <div style={{ maxWidth: 320, textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📷</div>
            <h2 style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#f87171' }}>Camera Error</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>{cameraError}</p>
          </div>
        </div>
      )}

      {/* Bottom hint */}
      <div style={{ position: 'absolute', bottom: '2rem', left: 0, right: 0, textAlign: 'center', fontSize: '0.95rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textShadow: '0 1px 6px rgba(0,0,0,0.8)' }}>
        {status === 'scanning' ? '⏳ Looking up product…' : 'Point at a product QR code'}
      </div>

      {/* Toasts */}
      <div style={{ position: 'absolute', bottom: '4.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 100, width: '90%', maxWidth: 340 }}>
        {toasts.map(t => (
          <div key={t.key} style={{
            background: t.status === 'success' ? 'rgba(34,197,94,0.92)' : t.status === 'not_found' ? 'rgba(251,191,36,0.92)' : 'rgba(239,68,68,0.92)',
            color: '#fff', borderRadius: 12, padding: '0.9rem 1.3rem', fontSize: '1rem', fontWeight: 600,
            width: '100%', textAlign: 'center', backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            {t.status === 'success' ? '✅ ' : t.status === 'not_found' ? '⚠️ ' : '❌ '}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
