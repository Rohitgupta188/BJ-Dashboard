/**
 * app/api/drive/webhook/route.ts
 *
 * Google Drive Push Notification receiver.
 *
 * This route is intentionally thin:
 *   1. Validate the channel token (security)
 *   2. ACK Google immediately with 200
 *   3. Delegate all processing to lib/drive/processChanges.ts via after()
 *
 * All core logic (lock, checkpoint, pagination, file processing) lives in
 * lib/drive/processChanges.ts so the recovery cron can reuse the same path.
 */

import { after }                         from "next/server";
import { NextRequest, NextResponse }     from "next/server";
import { processChangesForWebhook }      from "@/lib/drive/processChanges";
import { timingSafeEqual } from "crypto";

function safeTokenCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    // timingSafeEqual requires same-length buffers; pad the incoming one
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// ─── Route Segment Config ─────────────────────────────────────────────────────

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

// ─── Environment ──────────────────────────────────────────────────────────────

const WEBHOOK_SECRET =
  process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN;

if (!process.env.GOOGLE_SHEET_ID) {
  console.warn(
    "[drive/webhook] GOOGLE_SHEET_ID is not set — " +
    "customer sheet sync (FMS/registrations) will never run."
  );
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const incomingToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");
  const channelId     = req.headers.get("x-goog-channel-id")     ?? "unknown";
  const resourceId    = req.headers.get("x-goog-resource-id")    ?? "unknown";
  const messageNumber = req.headers.get("x-goog-message-number") ?? "0";

  // ── Security ───────────────────────────────────────────────────────────────
  if (!WEBHOOK_SECRET) {
    console.error("[drive/webhook] WEBHOOK_SECRET env var is not set — rejecting request");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }


  if (!incomingToken || !safeTokenCompare(incomingToken, WEBHOOK_SECRET)) {
    console.warn(
      `[drive/webhook] Rejected invalid token — channel=${channelId} resource=${resourceId}`
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Sync handshake ─────────────────────────────────────────────────────────
  // Google sends this immediately after channel registration to verify the URL.
  // Respond 200, do nothing else.
  if (resourceState === "sync") {
    console.log(`[drive/webhook] Sync ping — channel=${channelId} resource=${resourceId}`);
    return NextResponse.json({ status: "ok" });
  }

  console.log(
    `[drive/webhook] Change notification — ` +
    `state=${resourceState} channel=${channelId} msg#=${messageNumber}`
  );

  // ── ACK immediately, process in background ─────────────────────────────────
  after(async () => {
    try {
      await processChangesForWebhook(messageNumber);
    } catch (err) {
      const errType = err instanceof Error ? err.constructor.name : typeof err;
      console.error(
      `[drive/webhook] Fatal ${errType} in processChanges (msg#=${messageNumber}):`, err
      );
    }
  });

  return NextResponse.json({ status: "ok", message: "processing" });
}
