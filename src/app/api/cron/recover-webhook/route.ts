/**
 * GET /api/cron/recover-webhook
 *
 * Watchdog cron — runs every 5 minutes via Vercel Cron.
 *
 * Problem it solves:
 *   When a Vercel function is hard-killed mid-processing, the MongoDB lock
 *   (processingLockedAt) stays set. New webhook notifications see the lock
 *   and skip. If no new Drive change arrives after the lock TTL expires (6 min),
 *   the system stays stuck with unprocessed changes indefinitely.
 *
 * What this cron does:
 *   1. Checks if the lock is stale (held longer than LOCK_TTL_MS).
 *   2. If stale AND there is a pendingPageToken → a crash happened mid-page.
 *      Clears the lock so the next webhook (or this cron) can resume.
 *   3. If stale AND pageToken exists → calls drive.changes.list() to check
 *      if there are unprocessed changes. If yes, triggers processing directly.
 *
 * This cron is NOT the primary processing mechanism — that's the webhook.
 * It is purely a recovery/watchdog that ensures a crashed worker doesn't
 * leave the system stuck forever.
 */

import { after }                         from "next/server";
import { NextRequest, NextResponse }     from "next/server";
import { connectToDatabase }             from "@/lib/db";
import DriveChannel                      from "@/models/DriveChannel";
import { getDriveClient }                from "@/lib/drive/client";
import { processChangesForRecovery, LOCK_TTL_MS as SHARED_LOCK_TTL_MS } from "@/lib/drive/processChanges";
import { withDriveRetry }                from "@/lib/drive/retry";

export const dynamic     = "force-dynamic";
export const maxDuration = 300;

const LOCK_TTL_MS = SHARED_LOCK_TTL_MS; // single source of truth in processChanges.ts

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[recover-webhook] CRON_SECRET env var is not set — rejecting");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const channel = await DriveChannel.findById("main");
  if (!channel) {
    return NextResponse.json({ status: "no-channel", message: "No registered channel found." });
  }

  const now         = Date.now();
  const lockCutoff  = new Date(now - LOCK_TTL_MS);
  const lockAge     = channel.processingLockedAt
    ? now - channel.processingLockedAt.getTime()
    : null;
  const isLockStale = channel.processingLockedAt
    ? channel.processingLockedAt < lockCutoff
    : false;

  // ── Case 1: No stale lock, no pending token → system is healthy ────────────
  if (!isLockStale && !channel.pendingPageToken) {
    console.log("[recover-webhook] ✓ System healthy — no stale lock, no pending work.");
    return NextResponse.json({ status: "healthy" });
  }

  // ── Case 2: Stale lock detected → previous worker crashed ─────────────────
  if (isLockStale) {
    console.warn(
      `[recover-webhook] ⚠ Stale lock detected — held for ${Math.round((lockAge ?? 0) / 1000)}s. ` +
      `Clearing and recovering from pageToken=...${channel.pageToken?.slice(-8)}`
    );

    // Clear the stale lock atomically — only if it's still the same stale lock.
    // (Another invocation may have already cleared it between our read and now.)
    const cleared = await DriveChannel.findOneAndUpdate(
      {
        _id: "main",
        processingLockedAt: channel.processingLockedAt, // exact match
      },
      { $unset: { processingLockedAt: "" } },
      { returnDocument: "before" }
    );

    if (!cleared) {
      console.log("[recover-webhook] Lock already cleared by another invocation — skipping.");
      return NextResponse.json({ status: "skipped", message: "Lock cleared by another worker." });
    }

    console.log("[recover-webhook] Stale lock cleared ✓");
  }

  // ── Case 3: Check if there are actually unprocessed changes ───────────────
  const drive      = getDriveClient();
  const pageToken  = channel.pendingPageToken ?? channel.pageToken;

  let hasChanges = false;
  try {
    const changesRes = await withDriveRetry(
      () => drive.changes.list({
        pageToken,
        pageSize: 1,
        fields: "changes(fileId)",
        spaces: "drive",
        includeRemoved: true, // must match processChanges.ts
      }),
      "recover-webhook probe"
    );
    hasChanges = (changesRes.data.changes?.length ?? 0) > 0;
  } catch (err) {
    console.error("[recover-webhook] Failed to probe drive.changes.list:", err);
    return NextResponse.json({ status: "error", message: "Drive API probe failed" }, { status: 500 });
  }

  if (!hasChanges) {
    console.log("[recover-webhook] No unprocessed changes found — nothing to recover.");
    return NextResponse.json({ status: "healthy", message: "Lock cleared, no pending changes." });
  }

  // ── Case 4: Unprocessed changes exist → trigger processing via after() ─────
  console.log("[recover-webhook] Unprocessed changes found — triggering recovery processing.");

  // Dynamically import processChanges from the webhook route to reuse
  // the exact same processing logic including lock acquisition and checkpointing.
  after(async () => {
    try {
      await processChangesForRecovery("cron-recovery");
    } catch (err) {
      console.error("[recover-webhook] Recovery processing failed:", err);
    }
  });

  return NextResponse.json({
    status:    "recovering",
    message:   "Stale lock cleared. Recovery processing started.",
  });
}
