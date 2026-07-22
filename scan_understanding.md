# Scanner Architecture Analysis

This document provides a detailed professional breakdown of the Brahammand Jewels scanning infrastructure, answering your specific questions about the codebase, hardware devices, and how to migrate to a serverless architecture.

## 1. Hardware Devices (HID & Bluetooth) vs. Phones

You asked to analyze the codebase to see if hardware scanners (HID/Bluetooth) are using the API, because you couldn't see their code.

**The Answer:** Hardware scanners **do not** use the backend API at all. 

When you plug in an HID barcode scanner or pair a standard Bluetooth scanner, it acts as a **keyboard emulator**. When you scan a product, the scanner rapidly "types" the SKU into your computer and presses the `Enter` key.

In your frontend code (`src/scanner/adapters/hid.ts` and `src/components/dashboard/sales-scanner.tsx`), there is a global `keydown` event listener. This listener watches for rapid keyboard typing (too fast to be a human) and captures the SKU. 
Because of this, **HID and Bluetooth scanners completely bypass the server**. The entire `api/scanner/...` backend is built **strictly for smartphone scanning**.

## 2. The Smartphone API Flow

When a user scans a QR code using a smartphone, it triggers a multi-step API process:

### `api/scanner/push`
This is the endpoint your smartphone hits when it successfully decodes a QR code. It takes the SKU from the phone and "pushes" it into the backend system (specifically, into the `scannerBus`).

### `lib/scanner-bus`
This is an **in-memory message broker** using a Node.js `EventEmitter`. When `api/scanner/push` receives an SKU, it yells "I got a scan!" into the scanner bus.

**Why this breaks in Serverless:**
Serverless functions (like Vercel Lambdas) are stateless and distributed. Each API request spins up a brand new, isolated mini-server. If your smartphone hits `/push` on Server A, and your Dashboard is listening to the bus on Server B, they will never hear each other because they do not share the same memory. 

### `api/scanner/stream`
This endpoint uses **Server-Sent Events (SSE)**. The dashboard connects to this endpoint and holds the connection open indefinitely, listening for the `scannerBus` to yell out a new SKU.

**Why this breaks in Serverless:**
Serverless environments enforce strict timeouts. Vercel, for example, will forcibly kill any API connection after 10-15 seconds (or 300s on Pro). You cannot hold a connection open forever in a serverless environment.

## 3. How to Achieve a Serverless Scanner Flow

To fix this for a production serverless environment, you have to replace the in-memory `scannerBus` and the SSE connection. You have two primary options:

**Option A: External Pub/Sub (Recommended for Real-Time)**
You use an external service like **Pusher**, **Ably**, or **Supabase Realtime**. 
1. Phone hits `/api/scanner/push`.
2. The API forwards the SKU to Pusher.
3. The Dashboard connects directly to Pusher via WebSocket to receive the scan instantly.

**Option B: Database Polling (Easiest to Implement)**
1. Phone hits `/api/scanner/push`.
2. The API saves the scan to a temporary MongoDB collection (e.g., `Scans`).
3. The Dashboard automatically polls `GET /api/scanner/latest` every 2 seconds to check if a new scan was inserted, and retrieves it.

## 4. `api/network-ip`
This is a local development utility. It asks the server's operating system for its local IPv4 address (e.g., `192.168.1.11`). 
Your dashboard uses this to generate the QR code with the correct local network URL, so when you scan the QR code with your phone on the same Wi-Fi, it knows exactly how to connect to your development laptop. 
*(Note: This is useless in a production cloud environment, as the cloud server's local IP means nothing to your phone).*

## 5. Token Deletion
Per your instruction, `lib/scanner-token.ts` and `api/scanner/token` have been permanently deleted from the codebase, as the scanner system no longer relies on tokenized authentication.
