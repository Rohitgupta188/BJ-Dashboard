import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import ImageSyncFailure from "@/models/ImageSyncFailure";
import { getDriveClient } from "@/lib/drive/client";
import { processImageFile } from "@/lib/drive/processors/images";
import { withDriveRetry } from "@/lib/drive/retry";

export const dynamic = "force-dynamic";
export const maxDuration = 280; // Bounded execution time

const BATCH_SIZE = 50;
const LEASE_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();

  const fnStart = Date.now();
  const drive = getDriveClient();

  // Atomically claim up to BATCH_SIZE failures
  const claimedFailures = [];
  for (let i = 0; i < BATCH_SIZE; i++) {
    const failure = await ImageSyncFailure.findOneAndUpdate(
      {
        operation: "IMAGE_UPLOAD",
        $or: [
          { status: "PENDING", nextRetryAt: { $lte: new Date() } },
          { status: "PROCESSING", lockedUntil: { $lte: new Date() } }
        ]
      },
      {
        $set: {
          status: "PROCESSING",
          lockedUntil: new Date(Date.now() + LEASE_MS)
        }
      },
      { returnDocument: "after" }
    );
    if (!failure) break;
    claimedFailures.push(failure);
  }

  if (claimedFailures.length === 0) {
    return NextResponse.json({ status: "healthy", message: "No pending failures to recover." });
  }

  console.log(`[recover-image-failures] Claimed ${claimedFailures.length} failure(s). Processing...`);

  let successCount = 0;
  let failCount = 0;

  for (const failure of claimedFailures) {
    // Execution budget check (stop if we are within 40s of maxDuration)
    if (Date.now() - fnStart > 240_000) {
      console.warn(`[recover-image-failures] Execution budget exhausted at ${Date.now() - fnStart}ms. Stopping batch early.`);
      // Leftover claimed items will automatically become available when their lease expires.
      break;
    }

    try {
      // 1. Fetch current source-of-truth metadata from Google Drive
      const fileRes = await withDriveRetry(
        () => drive.files.get({ fileId: failure.fileId, fields: "id, name, mimeType, parents, md5Checksum, trashed" }),
        `fetch ${failure.fileName}`
      );
      const file = fileRes.data;

      // If file was trashed in Drive while we were failing, it cannot be processed.
      if (file.trashed) {
        await ImageSyncFailure.findByIdAndUpdate(failure._id, {
          $set: { 
            status: "NEEDS_REVIEW", 
            errorMessage: "File was trashed in Google Drive", 
            lockedUntil: undefined 
          }
        });
        failCount++;
        continue;
      }

      // 2. Process it identically to the webhook path
      console.log(`[recover-image-failures] Retrying ${failure.fileName}...`);
      await processImageFile(failure.fileId, file);

      // 3. If processImageFile finishes normally, it succeeded!
      await ImageSyncFailure.findByIdAndUpdate(failure._id, {
        $set: { status: "RESOLVED", lockedUntil: undefined }
      });
      successCount++;
    } catch (err: any) {
      if (err?.isHandled) {
        // processImageFile exhausted B2 retries again and persisted the new exponential backoff itself.
        // It's safely PENDING or NEEDS_REVIEW again.
        failCount++;
      } else {
        // Unhandled fatal error (e.g. Google Drive fetch failed, MD5 missing, or MongoDB went down)
        console.error(`[recover-image-failures] FATAL unhandled error for ${failure.fileName}:`, err);
        // Let the 5-min lease expire so it can be retried later, unless we want to mark it NEEDS_REVIEW here.
        // If it's a completely unhandled exception, it's safer to let the watchdog lease expiry handle it.
      }
    }
  }

  return NextResponse.json({
    status: "recovered",
    processed: claimedFailures.length,
    success: successCount,
    failed: failCount,
    elapsedMs: Date.now() - fnStart,
  });
}
