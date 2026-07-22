# System Architecture & Workflow

This document explains the two most critical underlying systems of the Brahammand Jewels Dashboard: **Authentication (Auth)** and the **Scanner Architecture**. 

The goal of this document is to explain *why* these specific technologies were chosen, exactly *how* they work, and *what problems* they solve.

---

## 1. Authentication System (JOSE & Next.js)

### The Problem
In modern web applications, we want to protect our routes so that unauthorized users cannot access sensitive data (like Quotations or the Catalog). 

Traditionally, authentication was done using server-side sessions (saved in a database or Redis). However, server-side sessions are slow because every single page load requires querying the database to check if the user is logged in. 
The modern approach is **JWT (JSON Web Tokens)** stored in cookies. But in Next.js, we use **Edge Middleware** to intercept routes before they even reach the server. The problem? The standard Node.js `jsonwebtoken` library **does not work** on the Edge runtime because it relies on Node's heavy, built-in crypto modules.

### The Solution: `jose`
We use the `jose` library. It is a lightweight JWT library built entirely on standard Web Crypto APIs, meaning it works perfectly on Next.js Edge Middleware.

### How it Works (The Flow)
1. **Login (`/api/auth/login`)**: When a user logs in, the server verifies their credentials and generates two JWTs using `jose`:
   - An **Access Token** (short lifespan, e.g., 15 minutes).
   - A **Refresh Token** (long lifespan, e.g., 7 days).
2. **HTTP-Only Cookies**: These tokens are sent to the browser as `HttpOnly` cookies. This is a critical security measure—it means JavaScript (and potential hackers) cannot read the tokens, completely preventing Cross-Site Scripting (XSS) attacks.
3. **Edge Middleware (`middleware.ts`)**: Every time the user navigates to a new page (e.g., `/quotations`), the Middleware intercepts the request. It uses `jose.jwtVerify()` to instantly check the Access Token's validity at the edge network (closer to the user), without ever hitting your database. If the token is valid, the page loads instantly.
4. **Silent Refresh**: If the Access Token is expired, the system seamlessly uses the Refresh Token to get a new Access Token in the background. The user is never interrupted.

### Why You Should Use This
- **Blazing Fast**: Validating tokens on the Edge means zero database latency. Pages load instantly.
- **Highly Secure**: HTTP-Only cookies prevent token theft.
- **Scalable**: Completely stateless. Your server doesn't need to remember who is logged in; the cryptographically signed token acts as an undeniable VIP pass.

---

## 2. The Scanner Architecture

### The Problem
Adding items to a Sales Quotation via typing SKUs is slow and error-prone. You need a way to scan QR codes and have the product instantly appear on the dashboard. 

However, scanning can happen in multiple ways:
- A physical Bluetooth/USB Barcode Scanner connected to the PC.
- A webcam directly attached to the dashboard.
- A mobile phone scanning a code while the employee looks at the dashboard monitor.

Handling all these inputs, connecting them to the database, and updating the React UI without refreshing the page is a massive technical challenge.

### The Solution: Real-Time Event Bus & URL Hydration
We built a dual-system architecture that seamlessly bridges the physical world (scanners) with the digital world (the React Dashboard).

#### Mechanism A: The SSE Stream (Server-Sent Events)
When a physical Bluetooth scanner is used, or a phone pushes a code, we use a real-time data stream.
1. **The Scanner Bus (`lib/scanner-bus.ts`)**: An internal Node.js event emitter.
2. **The Stream (`/api/scanner/stream`)**: When you open the Dashboard (`sales-quotation-view.tsx`), it quietly opens a one-way connection to the server. It sits there, waiting, using zero resources.
3. **The Push (`/api/scanner/push`)**: When a QR code is successfully decoded (e.g., by the `/scan` page), it sends a POST request with the `sku`. The server immediately broadcasts this SKU down the open stream to the listening Dashboard.
4. **The UI Update**: The Dashboard receives the event instantly, looks up the product in the catalog, and slides it onto the screen without the user ever touching the mouse.

#### Mechanism B: URL Parameter Hydration (The "Scan Page" Fix)
For the webcam scanner running directly on the dashboard device (`/scan`):
1. The user opens `/scan` and uses the webcam.
2. Upon a successful scan, the page immediately navigates back to the Dashboard, appending the SKU to the URL: `/?scanSku=CHGP010`.
3. The Dashboard loads, instantly reads the URL parameter, fetches the exact product, displays it, and then erases the URL parameter so it doesn't get stuck there on refresh.

### Why You Should Use This
- **Zero Friction**: The employee never has to click "Search" or "Refresh". The moment the beep sounds, the product is on the screen.
- **Decoupled Architecture**: The scanner logic (`/scan`) is completely separate from the display logic (`sales-quotation-view.tsx`). They don't need to know about each other; they just communicate via the URL or the background stream.
- **State Persistence**: Because we write the scanned items to `localStorage`, the employee can safely close the tab, open it tomorrow, and their quotation will still be sitting right there waiting for them.
