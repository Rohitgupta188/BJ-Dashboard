# Bluetooth Barcode Scanner — Complete Technical Reference

> **Context**: This document is based on real hardware observation (Portable Bluetooth Scanner, DC 3.7V / 650mA, CE/FCC/RoHS certified, supports iOS/Android/Windows OS) combined with deep research into browser APIs, Bluetooth profiles, and Next.js integration strategies.

---

## Table of Contents

1. [What We Observed (Photo Evidence)](#1-what-we-observed-photo-evidence)
2. [Configuration Barcodes — What %%SpecCodeAB Means](#2-configuration-barcodes)
3. [HID Mode vs SPP Mode — The Core Difference](#3-hid-mode-vs-spp-mode)
4. [Why SPP is Preferred in Professional Applications](#4-why-spp-is-preferred)
5. [Browser APIs — Which One to Use](#5-browser-apis)
6. [Web Serial API (SPP Integration)](#6-web-serial-api-spp-integration)
7. [WebHID API (HID Integration)](#7-webhid-api-hid-integration)
8. [Web Bluetooth API (BLE — for reference)](#8-web-bluetooth-api)
9. [Next.js Integration Guide](#9-nextjs-integration-guide)
10. [Decision Matrix](#10-decision-matrix)
11. [Browser Compatibility](#11-browser-compatibility)
12. [Step-by-Step Setup Checklist](#12-step-by-step-setup-checklist)
13. [Security & Permissions Model](#13-security--permissions-model)
14. [Common Pitfalls & Gotchas](#14-common-pitfalls--gotchas)

---

## 1. What We Observed (Photo Evidence)

From the physical scanner and app screenshots, we confirmed:

### Scanner Hardware
- **Type**: Portable Bluetooth Scanner
- **Battery**: DC 3.7V, 650mA
- **Input**: 5V 1A
- **OS Support**: iOS / Android / Windows OS
- **Certifications**: CE, FCC, RoHS
- **Origin**: Made in China

### App Screenshots (Scanner Settings Screen)
The companion application showed a **Scanner Settings** panel with multiple QR code configurations:

| QR Code Label | Purpose |
|---|---|
| **SPP Mode** | Switches scanner from HID to SPP (Serial Port Profile) |
| **Scanner Settings** | General configuration barcodes |
| **Battery** | Scan to read current battery level |
| **Standby Mode** | Configures sleep timeout (5 Min, 30 Min, Immediate) |

### The Key QR Code Decoded To:
```
%%SpecCodeAB
```
This is **not product data**. It is a **firmware configuration command**.

---

## 2. Configuration Barcodes

Manufacturers of generic Bluetooth scanners (Syble, MUNBYN, and compatible brands) use the `%%SpecCode` command prefix to control firmware-level settings via scanned barcodes.

### Known %%SpecCode Commands

| Command | Function |
|---|---|
| `%%SpecCodeAA` | Switch to **Bluetooth HID Mode** (acts like a keyboard) |
| `%%SpecCodeAB` | Switch to **Bluetooth SPP Mode** (Serial Port Profile) |
| `%%SpecCodeAC` | Switch to **Bluetooth BLE Mode** (Low Energy) |
| `%%SpecCode99` | Enter **Pairing Mode** (make scanner discoverable) |
| `%%SpecCode93` | **Factory Reset** (restore all defaults) |

### How Configuration Barcodes Work
1. The scanner firmware listens for special prefixed strings during normal scanning.
2. When a scanned barcode contains `%%SpecCode...`, it is intercepted by firmware — **not passed to the host**.
3. The firmware applies the new setting, beeps/flashes for confirmation, and restarts its Bluetooth stack in the new mode.
4. After scanning `%%SpecCodeAB`, the scanner enters SPP mode and waits for a new pairing.

> **Important**: You must **un-pair and re-pair** the scanner after changing modes. The Bluetooth profile changes, and Windows will treat it as a different device type.

---

## 3. HID Mode vs SPP Mode

### Bluetooth Profile Stack

```
Scanner
  |
  |-- [HID Mode]  -> Bluetooth Classic -> HID Profile  -> OS sees: "Keyboard"
  |
  |-- [SPP Mode]  -> Bluetooth Classic -> RFCOMM/SPP   -> OS sees: "COM Port (e.g. COM5)"
  |
  +-- [BLE Mode]  -> Bluetooth Low Energy -> GATT Profile -> OS sees: "BLE Device"
```

---

### HID Mode — How Data Flows

```
Scanner (HID Mode)
       |
Bluetooth HID Profile
       |
Windows Bluetooth Stack
       |
OS treats it as: "Bluetooth Keyboard"
       |
Active focused window receives keystrokes
       |
<input> field receives: "DZLR54123"
```

**Behaviour:**
- Scanner literally types characters as if a human pressed keyboard keys.
- Works with **zero code** — just scan, and data appears in any focused input.
- No serial port. No COM port. No driver needed beyond Bluetooth pairing.
- **Focus-dependent**: if no input field is focused, characters are lost or go to wrong window.

---

### SPP Mode — How Data Flows

```
Scanner (SPP Mode)
       |
Bluetooth Classic
       |
RFCOMM Protocol (Radio Frequency Communication)
       |
Windows Bluetooth Stack
       |
Virtual Serial Port (e.g. COM5, COM8)
       |
Your Application (reads COM port stream)
       |
Application decides what to do with the data
```

**Behaviour:**
- Scanner sends data over a virtual COM (serial) port.
- Your application must **explicitly open** the serial port and read from it.
- Works **independently of focus** — data always goes to your application.
- Used in POS systems, warehouse software, RFID readers, industrial terminals.

---

### Side-by-Side Comparison

| Feature | HID Mode | SPP Mode |
|---|---|---|
| Bluetooth Profile | HID (Human Interface Device) | RFCOMM / SPP (Serial Port Profile) |
| OS Appearance | Keyboard | COM Port (e.g. COM5) |
| Focus Required | YES — needs active input field | NO — data goes directly to app |
| Driver Required | None (built into OS) | None (Bluetooth stack handles it) |
| Complexity | Very simple | Moderate (need serial port reading) |
| Accidental Typing | HIGH risk (types anywhere) | ZERO risk |
| Professional Use | Consumer, simple apps | POS, warehouse, industrial |
| Browser API | WebHID / input events | Web Serial API |
| Reliability | Low (focus-dependent) | High (always reliable) |

---

## 4. Why SPP is Preferred

### The Focus Problem with HID

Imagine a warehouse employee scanning products:

```
HID Mode Problem:
Employee accidentally clicks on Notepad window.
Scanner fires.
      |
Windows sees: "keyboard input"
      |
Notepad receives: "DZLR54123"
      |
Dashboard: nothing recorded
      |
Data LOST
```

```
SPP Mode Solution:
Employee accidentally clicks on Notepad window.
Scanner fires.
      |
Data goes to COM5
      |
Application reads COM5 regardless of window focus
      |
Dashboard: data recorded correctly
      |
Data SAFE
```

### Why Enterprises Choose SPP
- **No focus dependency** — data is never lost due to wrong window being active.
- **Application owns the data** — no system-level keyboard interception needed.
- **Deterministic parsing** — application can parse the raw stream, apply custom logic.
- **Multi-scanner support** — multiple COM ports = multiple scanners simultaneously.
- **Audit logging** — every byte that comes through is under application control.

This is why POS systems, RFID readers, and warehouse management software universally prefer SPP over HID.

---

## 5. Browser APIs

The browser offers **three distinct APIs** for hardware communication. The correct choice depends entirely on which Bluetooth profile your scanner is using.

```
Browser Hardware APIs
|-- navigator.hid          -> WebHID API     -> For: HID Profile devices
|-- navigator.serial       -> Web Serial API -> For: Serial/SPP/COM port devices
+-- navigator.bluetooth    -> Web Bluetooth  -> For: BLE (GATT) devices only
```

### Quick Reference Table

| Scanner Mode | Bluetooth Profile | Correct Browser API | Wrong API |
|---|---|---|---|
| HID Mode | Bluetooth Classic HID | `navigator.hid` (WebHID) | `navigator.serial` |
| SPP Mode | Bluetooth Classic RFCOMM | `navigator.serial` (Web Serial) | `navigator.hid`, `navigator.bluetooth` |
| BLE Mode | Bluetooth Low Energy GATT | `navigator.bluetooth` (Web Bluetooth) | `navigator.hid`, `navigator.serial` |

> **Critical Warning**: `navigator.bluetooth.requestDevice()` is **only** for BLE devices. It cannot connect to Bluetooth Classic HID or SPP. This is a very common and costly mistake.

---

## 6. Web Serial API (SPP Integration)

### Overview

The **Web Serial API** (`navigator.serial`) allows web applications to communicate with serial port devices — including Bluetooth Classic SPP devices that appear as virtual COM ports in Windows.

- **Introduced**: Chrome 89 (USB serial)
- **Bluetooth SPP Support**: Chrome 117+ (Desktop)
- **Android Chrome**: Chrome 138+
- **`connected` attribute**: Chrome 130+ (detects device availability without opening port)

### Prerequisites

1. Scanner must be in **SPP mode** (scan `%%SpecCodeAB` barcode).
2. Scanner must be **paired with Windows** via Bluetooth Settings first.
3. Windows will assign a virtual COM port (e.g. `COM5`) — verify in Device Manager.
4. Page must be on **HTTPS** (or `localhost` for development).
5. Must be a **Chromium-based browser** (Chrome 117+, Edge 117+).

### Complete Implementation

```typescript
// lib/scanner/serial-scanner.ts
'use client';

export interface ScannerEvent {
  barcode: string;
  timestamp: Date;
  port: string;
}

export class SerialBarcodeScanner {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private isReading = false;
  private onData: ((event: ScannerEvent) => void) | null = null;
  private buffer = '';

  /**
   * Request port from user — must be called inside a user gesture (button click).
   * The browser will show a picker with all available serial ports,
   * including paired Bluetooth SPP devices.
   */
  async connect(onData: (event: ScannerEvent) => void): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error(
        'Web Serial API is not supported in this browser. Use Chrome 117+ or Edge 117+.'
      );
    }

    this.onData = onData;

    // Request port — browser shows picker dialog
    this.port = await navigator.serial.requestPort();

    // Open the port
    // Barcode scanners typically use 9600 baud; check your scanner manual
    await this.port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    });

    this.isReading = true;
    this.readLoop();
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;

    this.reader = this.port.readable.getReader();

    try {
      while (this.isReading) {
        const { value, done } = await this.reader.read();
        if (done) break;

        // Decode bytes to string
        const text = new TextDecoder('utf-8').decode(value);
        this.buffer += text;

        // Barcode scanners typically terminate each scan with \r\n or \r
        const lines = this.buffer.split(/\r\n|\r|\n/);

        // All complete lines except the last (which may be incomplete)
        for (let i = 0; i < lines.length - 1; i++) {
          const barcode = lines[i].trim();
          if (barcode.length > 0 && this.onData) {
            this.onData({
              barcode,
              timestamp: new Date(),
              port: 'Bluetooth SPP',
            });
          }
        }

        // Keep remainder in buffer
        this.buffer = lines[lines.length - 1];
      }
    } catch (error) {
      console.error('Serial read error:', error);
    } finally {
      this.reader?.releaseLock();
    }
  }

  async disconnect(): Promise<void> {
    this.isReading = false;

    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }

    if (this.port) {
      await this.port.close();
      this.port = null;
    }

    this.buffer = '';
  }

  get isConnected(): boolean {
    return this.port !== null;
  }
}
```

### React Hook for Next.js

```typescript
// hooks/use-serial-scanner.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import { SerialBarcodeScanner, ScannerEvent } from '@/lib/scanner/serial-scanner';

export function useSerialScanner() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastScan, setLastScan] = useState<ScannerEvent | null>(null);
  const [scans, setScans] = useState<ScannerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<SerialBarcodeScanner | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);

      if (!scannerRef.current) {
        scannerRef.current = new SerialBarcodeScanner();
      }

      await scannerRef.current.connect((event) => {
        setLastScan(event);
        setScans((prev) => [event, ...prev].slice(0, 100)); // Keep last 100 scans
      });

      setIsConnected(true);
    } catch (err: any) {
      setError(err.message ?? 'Failed to connect to scanner');
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (scannerRef.current) {
      await scannerRef.current.disconnect();
      setIsConnected(false);
    }
  }, []);

  return { isConnected, lastScan, scans, error, connect, disconnect };
}
```

---

## 7. WebHID API (HID Integration)

Use this when the scanner is in **HID mode** and you want to intercept data **without relying on keyboard focus**.

### Simple Keyboard-Wedge Approach (No API Needed)

If the scanner is in HID keyboard mode, it simply "types" characters. You can use a global keydown listener:

```typescript
'use client';
import { useEffect, useRef } from 'react';

export function useHIDKeyboardScanner(onScan: (barcode: string) => void) {
  const bufferRef = useRef('');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Barcode scanner sends characters very fast, then Enter
      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        if (barcode.length > 0) {
          onScan(barcode);
        }
        bufferRef.current = '';
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;

        // Clear buffer after 100ms of inactivity
        // (human typing is slower than scanner — scanner fires < 50ms between chars)
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          bufferRef.current = '';
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onScan]);
}
```

### WebHID API Approach (Advanced — for HID POS mode)

```typescript
'use client';

export async function connectWebHID(onBarcode: (barcode: string) => void) {
  if (!('hid' in navigator)) {
    throw new Error('WebHID is not supported. Use Chrome 89+.');
  }

  const devices = await navigator.hid.requestDevice({
    filters: [] // Show all HID devices
  });

  if (devices.length === 0) {
    throw new Error('No HID device selected.');
  }

  const device = devices[0];
  await device.open();

  device.addEventListener('inputreport', (event: HIDInputReportEvent) => {
    const { data } = event;
    const barcode = new TextDecoder().decode(data);
    onBarcode(barcode.trim());
  });

  return device;
}
```

---

## 8. Web Bluetooth API

> **Important**: This scanner uses **Bluetooth Classic** (HID + SPP). The Web Bluetooth API is **NOT applicable** here. It is documented for completeness only.

The Web Bluetooth API (`navigator.bluetooth`) communicates with **Bluetooth Low Energy (BLE)** devices using the GATT protocol. It cannot:
- Connect to Bluetooth Classic devices
- Access RFCOMM / SPP profiles
- Communicate with HID Bluetooth Classic devices

```typescript
// This is for BLE devices ONLY — not for this scanner
const device = await navigator.bluetooth.requestDevice({
  filters: [{ services: ['heart_rate'] }] // BLE service UUID
});
// Will NOT find your Bluetooth Classic scanner
```

If your scanner supported BLE mode (`%%SpecCodeAC`), you would use this API. For the current use case (HID or SPP), use Web Serial or WebHID instead.

---

## 9. Next.js Integration Guide

### Important: Next.js Has No Bluetooth Module

Next.js itself has **no Bluetooth or serial module**. It is React + server-side rendering features. All hardware APIs (`navigator.serial`, `navigator.hid`, `navigator.bluetooth`) come from the **browser**.

Your React component running in the browser can call these APIs directly.

### Next.js Specific Rules

| Rule | Reason |
|---|---|
| Mark scanner components with `'use client'` | Hardware APIs do not exist on the server (Node.js has no `navigator`) |
| Never call `navigator.serial` at module top level | SSR will crash (no `navigator` on server) |
| Only call `requestPort()` inside a user gesture | Browser security — cannot auto-connect on page load |
| Use `useEffect` to set up event listeners | Ensure DOM is available before attaching listeners |
| Use `dynamic(() => import(...), { ssr: false })` | Prevents SSR of client-only hardware code |

### Complete Next.js Scanner Component

```typescript
// components/scanner/scanner-connect.tsx
'use client';

import { useSerialScanner } from '@/hooks/use-serial-scanner';

export default function ScannerConnect() {
  const { isConnected, lastScan, scans, error, connect, disconnect } = useSerialScanner();

  const isSupported =
    typeof navigator !== 'undefined' && 'serial' in navigator;

  return (
    <div className="scanner-panel">
      {!isSupported && (
        <div className="error-banner">
          Web Serial API not supported. Please use Chrome 117+ or Edge 117+.
        </div>
      )}

      <div className="connection-status">
        <span className={isConnected ? 'status-connected' : 'status-disconnected'} />
        {isConnected ? 'Scanner Connected (SPP)' : 'Scanner Disconnected'}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="controls">
        {!isConnected ? (
          <button
            onClick={connect}       // Must be a user gesture
            disabled={!isSupported}
          >
            Connect Scanner
          </button>
        ) : (
          <button onClick={disconnect}>Disconnect</button>
        )}
      </div>

      {lastScan && (
        <div className="last-scan">
          <strong>Last Scan:</strong> {lastScan.barcode}
          <span className="timestamp">{lastScan.timestamp.toLocaleTimeString()}</span>
        </div>
      )}

      <div className="scan-history">
        {scans.map((scan, i) => (
          <div key={i} className="scan-item">
            <code>{scan.barcode}</code>
            <span>{scan.timestamp.toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Using Dynamic Import (Recommended for SSR Safety)

```typescript
// app/dashboard/page.tsx
import dynamic from 'next/dynamic';

const ScannerConnect = dynamic(
  () => import('@/components/scanner/scanner-connect'),
  {
    ssr: false,  // Critical: never render scanner component on server
    loading: () => <div>Loading scanner...</div>,
  }
);

export default function DashboardPage() {
  return (
    <main>
      <h1>Warehouse Dashboard</h1>
      <ScannerConnect />
    </main>
  );
}
```

---

## 10. Decision Matrix

```
START
  |
  v
Is the scanner in SPP mode?
  |
  |-- YES --> Use Web Serial API (navigator.serial)
  |              - Reliable
  |              - Focus-independent
  |              - Chrome 117+
  |
  +-- NO (HID mode)
        |
        v
        Do you need background scanning (no input focus)?
          |
          |-- YES --> Use WebHID API (navigator.hid)
          |              Requires scanner in HID POS mode
          |              More complex to parse
          |
          +-- NO (simple use case)
                |
                v
                Use Keyboard-Wedge approach
                  Listen to keydown events globally
                  Zero setup, works immediately
                  Focus-dependent — risk of data loss
```

### Recommendation for This Project

**Use SPP mode + Web Serial API.**

Reasons:
1. The scanner already supports SPP (`%%SpecCodeAB` confirmed from photos).
2. Dashboard environments require reliable, focus-independent scanning.
3. Web Serial API is officially supported in Chrome 117+ (production-ready).
4. SPP eliminates accidental typing into other windows.
5. Data parsing is straightforward — barcode scanners send one line per scan.

---

## 11. Browser Compatibility

### Web Serial API (for SPP mode)

| Browser | SPP Support | Version | Notes |
|---|---|---|---|
| Chrome (Desktop) | Full | 117+ | Recommended for production |
| Edge (Desktop) | Full | 117+ | Same Chromium engine |
| Chrome (Android) | Full | 138+ | Requires Android 12+ |
| Firefox | None | — | Not implemented |
| Safari | None | — | Not planned |

### WebHID API (for HID mode)

| Browser | HID Support | Version | Notes |
|---|---|---|---|
| Chrome (Desktop) | Full | 89+ | Works well |
| Edge (Desktop) | Full | 89+ | Works well |
| Chrome (Android) | None | — | Android security restrictions |
| Firefox | None | — | Not implemented |
| Safari | None | — | Not planned |

### Web Bluetooth API (BLE only — for reference)

| Browser | BLE Support | Notes |
|---|---|---|
| Chrome (Desktop) | Yes | GATT only |
| Edge | Yes | — |
| Chrome (Android) | Yes | Good mobile BLE support |
| Firefox | No | — |
| Safari | Partial | Experimental / macOS only |

---

## 12. Step-by-Step Setup Checklist

### Phase 1: Configure the Scanner

- [ ] Power on the scanner (hold power button until LED flashes).
- [ ] Scan the SPP Mode barcode (`%%SpecCodeAB` QR code from Scanner Settings in app).
- [ ] Wait for confirmation beep — scanner reboots its Bluetooth stack.
- [ ] Scanner is now discoverable in SPP mode.

### Phase 2: Pair with Windows

- [ ] Open Windows Settings -> Bluetooth & devices -> Add device.
- [ ] Select Bluetooth.
- [ ] Scanner should appear (often as "Barcode Scanner" or "BT Scanner SPP").
- [ ] Click to pair. No PIN required for most scanners.
- [ ] Windows assigns a COM port (e.g. COM5). Note this port.
- [ ] Verify in Device Manager -> Ports (COM & LPT).

### Phase 3: Verify the COM Port

- [ ] Open Windows Device Manager.
- [ ] Expand Ports (COM & LPT).
- [ ] Look for "Standard Serial over Bluetooth link (COM5)" or similar.
- [ ] Note the COM number — this is what the browser will show in the port picker.

### Phase 4: Test in Browser

- [ ] Open Chrome (117+).
- [ ] Navigate to your app (HTTPS or localhost).
- [ ] Click "Connect Scanner" button (user gesture required).
- [ ] Browser shows port picker — select the Bluetooth COM port.
- [ ] Click Connect.
- [ ] Scan a barcode — data should appear in the app.

### Phase 5: Integration into Next.js

- [ ] Create `SerialBarcodeScanner` class (see Section 6).
- [ ] Create `useSerialScanner` hook (see Section 6).
- [ ] Create `ScannerConnect` component marked `'use client'`.
- [ ] Import with `dynamic(..., { ssr: false })` on dashboard page.
- [ ] Test end-to-end on HTTPS.

---

## 13. Security & Permissions Model

The browser enforces a strict permissions model for hardware APIs.

### Explicit User Consent Required

```
Your App Code                   Browser
navigator.serial.requestPort()
       |
       +---------------------> Shows Port Picker Dialog
                                  +--------------------------+
                                  |  Choose a serial port    |
                                  |                          |
                                  |  o COM3 - USB Device     |
                                  |  o COM5 - BT Scanner SPP |
                                  |                          |
                                  |  [Cancel]   [Connect]    |
                                  +--------------------------+
                                           |
                                           v
                                  Permission granted — app gets port access
```

### Security Rules Summary

| Rule | Applies To |
|---|---|
| Must run on HTTPS or localhost | All hardware APIs |
| Must be called inside a user gesture (click, tap) | `requestPort()`, `requestDevice()` |
| No automatic connection on page load | All hardware APIs |
| Permission is remembered per-origin | Chrome remembers granted devices |
| User can revoke permission at any time | Via Chrome settings |
| Only works in Chromium-based browsers | Web Serial, WebHID |

---

## 14. Common Pitfalls & Gotchas

### Pitfall 1: Wrong API for the Device Mode
```
WRONG: Using navigator.bluetooth for SPP
   SPP is Bluetooth Classic, not BLE
   navigator.bluetooth only handles BLE/GATT

RIGHT: Using navigator.serial for SPP
```

### Pitfall 2: Calling requestPort() on Page Load
```typescript
// WRONG — will throw SecurityError
useEffect(() => {
  navigator.serial.requestPort(); // Not a user gesture
}, []);

// RIGHT — called inside button click handler
<button onClick={() => navigator.serial.requestPort()}>Connect</button>
```

### Pitfall 3: Using SSR for Scanner Components
```typescript
// WRONG — navigator does not exist on Node.js server
export default async function Page() {
  const port = await navigator.serial.requestPort(); // ReferenceError
}

// RIGHT — client component + dynamic import
'use client';
// or
dynamic(() => import('./ScannerComponent'), { ssr: false })
```

### Pitfall 4: Not Re-Pairing After Mode Change
```
After scanning %%SpecCodeAB:
  1. Scanner changes its Bluetooth profile
  2. Old pairing becomes invalid
  3. Windows may show the device as disconnected or errored

Solution:
  1. Remove old Bluetooth device from Windows settings
  2. Re-pair as a new device
  3. New COM port will be assigned
```

### Pitfall 5: Wrong Baud Rate
```typescript
// Default for most generic scanners:
await port.open({ baudRate: 9600 });

// Some scanners use 115200 — check your scanner manual
// Wrong baud rate gives garbled data or no data at all
```

### Pitfall 6: Missing HTTPS in Production
```
localhost      -> Works (browser exception for development)
https://...    -> Works
http://...     -> BLOCKED (hardware APIs require secure context)
```

### Pitfall 7: Buffer Accumulation Without Proper Parsing
```typescript
// WRONG — single read may not contain a complete barcode
const { value } = await reader.read();
const barcode = new TextDecoder().decode(value); // May be partial!

// RIGHT — use a buffer and split on line endings
buffer += new TextDecoder().decode(value);
const lines = buffer.split(/\r\n|\r|\n/);
// Process complete lines, keep remainder in buffer
```

---

## Summary

| Topic | Key Takeaway |
|---|---|
| Scanner hardware | Supports HID, SPP, and BLE modes via config barcodes |
| `%%SpecCodeAB` | Firmware command to switch scanner to SPP mode |
| SPP vs HID | SPP is focus-independent, professional, and reliable |
| Correct API | Use `navigator.serial` (Web Serial API) for SPP mode |
| Browser support | Chrome 117+ and Edge 117+ for Web Serial (Bluetooth SPP) |
| Next.js rules | `'use client'`, dynamic import with `ssr: false`, user gesture required |
| HTTPS required | All hardware APIs require HTTPS (or localhost) |
| Pairing required | Device must be paired with Windows before browser can access it |

---

*Document prepared: July 2026*
*Based on: Physical scanner observation, Chrome documentation, MDN Web Docs, and confirmed research into the %%SpecCode firmware command set.*
