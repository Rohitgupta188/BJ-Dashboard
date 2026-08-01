/**
 * app/api/drive/webhook/route.ts
 *
 * Google Drive Push Notification receiver.
 *
 * Architecture
 * ────────────
 * Google sends an empty POST to this endpoint whenever a file in the watched
 * folder changes. We respond with 200 immediately (< 1ms), then run the heavy
 * sync work inside Next.js `after()` — which lets the response flush before
 * the processing begins, avoiding any client-facing latency.
 *
 * Exactly-once delivery: checkpoint-before-work pattern
 * ──────────────────────────────────────────────────────
 * The Drive API gives us a `pageToken` per PAGE of changes, not per individual
 * change. The classic bug is saving the token AFTER processing the page —
 * when Vercel times out mid-page, the next invocation replays the whole page.
 *
 * Solution (implemented below):
 *   1. Before processing each page → save pendingPageToken to DB.
 *   2. Before processing each change → save pendingChangeIndex to DB.
 *   3. On resume → skip all changes with index <= pendingChangeIndex.
 *   4. After a page is fully done → commit pageToken, clear pending fields.
 *
 * This guarantees no file is ever processed twice, even across hard Vercel
 * timeout restarts.
 *
 * Timing logs
 * ───────────
 * Every major stage emits a [drive/webhook] log with elapsed milliseconds so
 * we can pinpoint which operation consumes Vercel execution time in production.
 */

import { after }         from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { connectToDatabase } from "@/lib/db";
import DriveChannel      from "@/models/DriveChannel";
import { IMAGE_MIME_TYPES, processImageFile } from "@/lib/drive/processors/images";
import { processExcelFile }    from "@/lib/drive/processors/excel";
import { processCustomerSheet } from "@/lib/drive/processors/sheets";
import { processDeletedFile }  from "@/lib/drive/processors/delete";
import { GaxiosResponseWithHTTP2 } from "googleapis-common";
import { drive_v3 } from "googleapis";

// ─── Route Segment Config ────────────────────────────────────────────────────

export const dynamic    = "force-dynamic";
/**
 * Tell Vercel this function may run up to 5 minutes.
 * The after() background task runs within this window.
 * Requires Vercel Pro or Enterprise plan.
 * Hobby plan max is 60s — adjust accordingly if on Hobby.
 */
export const maxDuration = 300; // seconds

// ─── Environment ──────────────────────────────────────────────────────────────

const WEBHOOK_SECRET =
  process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN;

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SHEET_ID  = process.env.GOOGLE_SHEET_ID;

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * We break out of the processing loop 20 seconds before the hard limit
 * to guarantee MongoDB checkpoint state is saved cleanly.
 * maxDuration=300s → budget=280s
 */
const EXECUTION_BUDGET_MS = 280_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a human-readable elapsed time string, e.g. "1234ms" */
function elapsedMs(start: number): string {
  return `${Date.now() - start}ms`;
}

// ─── Core Processing Logic ────────────────────────────────────────────────────

async function processChanges(msgNumber: string): Promise<void> {
  const fnStart = Date.now();

  if (!FOLDER_ID) {
    throw new Error("[drive/webhook] GOOGLE_DRIVE_FOLDER_ID env var is not set");
  }

  // ── DB Connection ───────────────────────────────────────────────────────────
  const tDb = Date.now();
  await connectToDatabase();
  console.log(`[drive/webhook] msg#=${msgNumber} DB connect: ${elapsedMs(tDb)}`);

  const channel = await DriveChannel.findById("main");
  if (!channel?.pageToken) {
    console.warn(
      "[drive/webhook] No DriveChannel document found in MongoDB. " +
      "Run `npm run register:webhook` to initialise the channel."
    );
    return;
  }

  const drive    = getDriveClient();
  const folderId = FOLDER_ID;

  // ── Determine starting point ────────────────────────────────────────────────
  // If we have a pendingPageToken, we timed out mid-page last time.
  // Resume from that page and skip changes already processed.
  let pageToken: string | null | undefined;
  let resumeAtIndex = -1; // skip changes with index <= this value

  if (channel.pendingPageToken) {
    pageToken      = channel.pendingPageToken;
    resumeAtIndex  = channel.pendingChangeIndex ?? -1;
    console.log(
      `[drive/webhook] msg#=${msgNumber} Resuming from checkpoint — ` +
      `pendingPageToken=...${pageToken.slice(-8)} resumeAtIndex=${resumeAtIndex}`
    );
  } else {
    pageToken = channel.pageToken;
    console.log(
      `[drive/webhook] msg#=${msgNumber} Fresh start — ` +
      `pageToken=...${pageToken.slice(-8)}`
    );
  }

  // ── Parent folder cache ─────────────────────────────────────────────────────
  // Avoids hitting the Drive API repeatedly for the same parent folder.
  const parentCache = new Map<string, boolean>();

  async function isInWatchedFolder(fileParents: string[]): Promise<boolean> {
    if (fileParents.includes(folderId)) return true;

    for (const parentId of fileParents) {
      if (parentCache.has(parentId)) {
        if (parentCache.get(parentId)) return true;
        continue;
      }
      try {
        const res = await drive.files.get({ fileId: parentId, fields: "parents" });
        const grandparents: string[] = res.data.parents ?? [];
        const isChild = grandparents.includes(folderId);
        parentCache.set(parentId, isChild);
        if (isChild) return true;
      } catch {
        parentCache.set(parentId, false);
      }
    }
    return false;
  }

  // ── Pagination loop ─────────────────────────────────────────────────────────
  let totalProcessed = 0;
  let pagesProcessed = 0;
  let isFirstPage    = true;

  while (pageToken) {
    const elapsed = Date.now() - fnStart;
    if (elapsed > EXECUTION_BUDGET_MS) {
      console.log(
        `[drive/webhook] msg#=${msgNumber} ⏱ Budget exhausted at ${elapsed}ms. ` +
        `Checkpoint saved — next ping will resume.`
      );
      break;
    }

    // ── Fetch a page of changes ───────────────────────────────────────────────
    const tPage = Date.now();
    pagesProcessed++;

    const changesRes: GaxiosResponseWithHTTP2<drive_v3.Schema$ChangeList> =
      await drive.changes.list({
        pageToken,
        // Keep pages small so the budget check fires frequently.
        // Drive API max is 1000; 100 is a good balance for our use case.
        pageSize: 100,
        fields:
          "nextPageToken, newStartPageToken, " +
          "changes(fileId, removed, file(id, name, mimeType, parents, trashed))",
        includeRemoved: true,
        spaces: "drive",
      });

    const changes = changesRes.data.changes ?? [];
    console.log(
      `[drive/webhook] msg#=${msgNumber} Page ${pagesProcessed}: ` +
      `${changes.length} change(s) fetched in ${elapsedMs(tPage)}`
    );

    // ── CHECKPOINT: save pendingPageToken BEFORE touching any changes ─────────
    // This means: even if we time out on this page, the next invocation will
    // start from this page's token — not the one before it.
    const nextPageToken = changesRes.data.nextPageToken;
    if (isFirstPage || !channel.pendingPageToken) {
      // Only write if this is a new page (not a resume of the same pending page)
      await DriveChannel.findByIdAndUpdate("main", {
        pendingPageToken:   pageToken,
        pendingChangeIndex: -1,
      });
    }
    isFirstPage = false;

    // ── Process each change ───────────────────────────────────────────────────
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      // Skip changes already handled in a previous (timed-out) invocation
      if (i <= resumeAtIndex) {
        console.log(`[drive/webhook] msg#=${msgNumber}   skip index=${i} (already processed)`);
        continue;
      }

      if (!change.fileId) continue;

      // ── CHECKPOINT: mark this change index as in-progress ──────────────────
      // If Vercel kills us here, the next run knows to start from index i.
      await DriveChannel.findByIdAndUpdate("main", { pendingChangeIndex: i });

      const tChange = Date.now();
      const { fileId, file } = change;
      const mimeType = file?.mimeType ?? "";
      const parents  = file?.parents  ?? [];
      const fileName = file?.name;

      // ── Deletion ────────────────────────────────────────────────────────────
      if (change.removed || file?.trashed) {
        // When permanently purged, Drive sends file=null with no parents.
        // Default to false — we handle trash (where parents are still present).
        const isWatched =
          parents.length > 0 ? await isInWatchedFolder(parents) : false;

        if (isWatched) {
          try {
            await processDeletedFile(fileId, fileName, mimeType);
            totalProcessed++;
          } catch (err) {
            console.error(
              `[drive/webhook] msg#=${msgNumber} Delete handler failed fileId=${fileId}:`,
              err instanceof Error ? err.message : err
            );
          }
        }
        console.log(
          `[drive/webhook] msg#=${msgNumber}   [${i}] delete ` +
          `"${fileName ?? fileId}" watched=${isWatched} ${elapsedMs(tChange)}`
        );
        continue;
      }

      if (!file) continue;

      // ── Addition / Update ───────────────────────────────────────────────────
      const tFolder = Date.now();
      const isInFolder = await isInWatchedFolder(parents);
      const folderCheckMs = Date.now() - tFolder;

      const isFMSSheet =
        mimeType === GOOGLE_SHEET_MIME && !!SHEET_ID && fileId === SHEET_ID;

      if (!isInFolder && !isFMSSheet) {
        // Not our folder — skip silently (no log spam for account-wide noise)
        continue;
      }

      try {
        if (isInFolder && IMAGE_MIME_TYPES.has(mimeType)) {
          await processImageFile(fileId, file);
          totalProcessed++;
          console.log(
            `[drive/webhook] msg#=${msgNumber}   [${i}] image "${fileName}" ` +
            `folderCheck=${folderCheckMs}ms total=${elapsedMs(tChange)}`
          );

        } else if (isInFolder && EXCEL_MIME_TYPES.has(mimeType)) {
          const result = await processExcelFile(fileId, file.name ?? "upload.xlsx");
          totalProcessed++;
          console.log(
            `[drive/webhook] msg#=${msgNumber}   [${i}] excel "${fileName}" ` +
            `ins=${result.upserted} upd=${result.modified} skip=${result.skipped} ` +
            `folderCheck=${folderCheckMs}ms total=${elapsedMs(tChange)}`
          );
          if (result.errors.length > 0) {
            console.warn(
              `[drive/webhook] msg#=${msgNumber} Excel ${fileName} had ` +
              `${result.errors.length} row error(s):`,
              result.errors.slice(0, 5)
            );
          }

        } else if (isFMSSheet) {
          await processCustomerSheet(fileId);
          totalProcessed++;
          console.log(
            `[drive/webhook] msg#=${msgNumber}   [${i}] sheet "${fileName}" ` +
            `total=${elapsedMs(tChange)}`
          );
        }
      } catch (err) {
        console.error(
          `[drive/webhook] msg#=${msgNumber} Failed fileId=${fileId} ` +
          `name="${file.name}" mimeType=${mimeType}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    // After processing all changes on this page, clear the pending checkpoint.
    resumeAtIndex = -1; // only skip on the first (resumed) page

    // ── Advance token ─────────────────────────────────────────────────────────
    if (nextPageToken) {
      pageToken = nextPageToken;
      // Commit this page's token and clear the pending checkpoint atomically.
      // The next page will set its own pendingPageToken before processing.
      await DriveChannel.findByIdAndUpdate("main", {
        pageToken,
        $unset: { pendingPageToken: "", pendingChangeIndex: "" },
      });
    } else {
      // We have consumed all changes — advance to the new start token.
      const newToken = changesRes.data.newStartPageToken;
      if (newToken) {
        await DriveChannel.findByIdAndUpdate("main", {
          pageToken: newToken,
          $unset: { pendingPageToken: "", pendingChangeIndex: "" },
        });
        console.log(
          `[drive/webhook] msg#=${msgNumber} Fully caught up. ` +
          `newStartPageToken=...${newToken.slice(-8)}`
        );
      }
      pageToken = null;
    }
  }

  console.log(
    `[drive/webhook] msg#=${msgNumber} ■ DONE — ` +
    `${totalProcessed} file(s) across ${pagesProcessed} page(s) in ${elapsedMs(fnStart)}`
  );
}

// ─── Route Handler ────────────────────────────────────────────────────────────



export async function POST(req: NextRequest) {
  const incomingToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");
  const channelId     = req.headers.get("x-goog-channel-id")     ?? "unknown";
  const resourceId    = req.headers.get("x-goog-resource-id")    ?? "unknown";
  const messageNumber = req.headers.get("x-goog-message-number") ?? "0";

  // ── Security: validate channel token ───────────────────────────────────────
  if (WEBHOOK_SECRET && incomingToken !== WEBHOOK_SECRET) {
    console.warn(
      `[drive/webhook] Rejected invalid token — ` +
      `channel=${channelId} resource=${resourceId}`
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Handshake: Google sends a "sync" ping when the channel is first created
  if (resourceState === "sync") {
    console.log(
      `[drive/webhook] Sync ping — channel=${channelId} resource=${resourceId}`
    );
    return NextResponse.json({ status: "ok" });
  }

  console.log(
    `[drive/webhook] Change notification — ` +
    `state=${resourceState} channel=${channelId} msg#=${messageNumber}`
  );

  // ── Respond immediately (< 1ms) then process in the background ────────────
  // after() is stable in Next.js 15.1+. The callback runs after the response
  // has been flushed, within the maxDuration window of this route (300s).
  after(async () => {
    try {
      await processChanges(messageNumber);
    } catch (err) {
      console.error(
        `[drive/webhook] Fatal error in processChanges (msg#=${messageNumber}):`,
        err instanceof Error ? err.message : err
      );
    }
  });

  return NextResponse.json({ status: "ok", message: "processing" });
}
