/**
 * lib/drive/processChanges.ts
 *
 * Shared Drive change-processing logic used by:
 *   - /api/drive/webhook      (primary path — triggered by Google notifications)
 *   - /api/cron/recover-webhook (watchdog — triggered when a worker crashes)
 *
 * Exports two functions:
 *   processChangesForWebhook(msgNumber)  — called by the webhook route
 *   processChangesForRecovery(label)     — called by the recovery cron
 *
 * Both call the same internal _acquireLockAndProcess() which handles:
 *   - Atomic MongoDB lock acquisition with TTL
 *   - Checkpoint-before-work (pendingPageToken / pendingChangeIndex)
 *   - Full pagination loop with execution budget guard
 *   - Drive client reset on 401
 *   - Lock release in finally block
 */

import { getDriveClient, resetDriveClients } from "@/lib/drive/client";
import { connectToDatabase } from "@/lib/db";
import DriveChannel from "@/models/DriveChannel";
import type { IDriveChannel } from "@/models/DriveChannel";
import type { HydratedDocument } from "mongoose";
import { IMAGE_MIME_TYPES, processImageFile, maybeIndexNewImage } from "@/lib/drive/processors/images";
import { processExcelFile } from "@/lib/drive/processors/excel";
import { processCustomerSheet } from "@/lib/drive/processors/sheets";
import { processDeletedFile } from "@/lib/drive/processors/delete";
import { withDriveRetry } from "@/lib/drive/retry";
import { EXCEL_MIME_TYPES, GOOGLE_SHEET_MIME } from "@/lib/drive/constants";
import { GaxiosResponseWithHTTP2 } from "googleapis-common";
import { drive_v3 } from "googleapis";


// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Lock TTL: 6 minutes.
 * If Vercel hard-kills a run, the lock auto-expires after this window
 * so the recovery cron or next webhook notification can take over.
 */
export const LOCK_TTL_MS = 6 * 60 * 1000;

/**
 * Stop processing 20 seconds before the Vercel hard limit so MongoDB
 * checkpoint state is always saved cleanly before the function dies.
 * maxDuration=300s → budget=280s
 */
const EXECUTION_BUDGET_MS = 280_000;

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsedMs(start: number): string {
  return `${Date.now() - start}ms`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Called by the webhook route on every Google Drive notification. */
export async function processChangesForWebhook(msgNumber: string): Promise<void> {
  await connectToDatabase();
  await _acquireLockAndProcess(msgNumber);
}

/** Called by the recovery cron when a stale lock is detected. */
export async function processChangesForRecovery(label: string): Promise<void> {
  await connectToDatabase();
  await _acquireLockAndProcess(label);
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function _acquireLockAndProcess(label: string): Promise<void> {
  const fnStart = Date.now();

  if (!FOLDER_ID) {
    throw new Error("[drive/processChanges] GOOGLE_DRIVE_FOLDER_ID env var is not set");
  }

  // ── Atomic lock acquisition ────────────────────────────────────────────────
  // returnDocument:"after" returns the document WITH processingLockedAt set,
  // so we can pass it directly to _processChanges without a second DB read.
  const lockCutoff = new Date(Date.now() - LOCK_TTL_MS);
  const lockedChannel = await DriveChannel.findOneAndUpdate(
    {
      _id: "main",
      $or: [
        { processingLockedAt: { $exists: false } },
        { processingLockedAt: null },
        { processingLockedAt: { $lt: lockCutoff } },
      ],
    },
    { $set: { processingLockedAt: new Date() } },
    { returnDocument: "after" }  // gives us the full doc — no second read needed
  );

  if (!lockedChannel) {
    // Rather than silently dropping this notification, mark that work is
    // pending. The current lock-holder will see this flag after its current
    // processing pass and immediately loop for another pass — same Vercel
    // invocation, no extra HTTP round-trip, no missed changes.
    await DriveChannel.findByIdAndUpdate("main", {
      $set: { pendingWork: true },
    }).catch((e) =>
      console.error("[drive/processChanges] Failed to set pendingWork flag:", e)
    );
    console.log(
      `[drive/processChanges] label=${label} Lock busy — queued as pendingWork.`
    );
    return;
  }

  try {
    // ── Work-drain loop ────────────────────────────────────────────────────
    // After each pass, atomically check-and-clear the pendingWork flag.
    // If any notification arrived while we were processing, loop immediately
    // instead of letting it wait for the recover-webhook cron.
    let pass = 0;
    while (true) {
      pass++;
      const passLabel = pass === 1 ? label : `${label}-pass${pass}`;
      await _processChanges(passLabel, fnStart, lockedChannel);

      // Atomically clear pendingWork and check if it was set.
      const before = await DriveChannel.findByIdAndUpdate(
        "main",
        { $unset: { pendingWork: "" } },
        { returnDocument: "before" }
      );

      if (!before?.pendingWork) break; // nothing queued — we're done

      console.log(
        `[drive/processChanges] label=${label} pendingWork detected after pass ${pass} — looping.`
      );
    }
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    if (status === 401) {
      console.warn("[drive/processChanges] Drive API 401 — resetting client singletons.");
      resetDriveClients();
    }
    throw err;
  } finally {
    await DriveChannel.findByIdAndUpdate("main", {
      $unset: { processingLockedAt: "" },
    }).catch((err) =>
      console.error("[drive/processChanges] Failed to release lock:", err)
    );
  }
}

async function _processChanges(
  label:   string,
  fnStart: number,
  channel: HydratedDocument<IDriveChannel>  // passed from lock acquisition — no second DB read
): Promise<void> {
  if (!channel.pageToken) {
    console.warn(
      "[drive/processChanges] DriveChannel has no pageToken. " +
      "Run `npm run register:webhook` to initialise the channel."
    );
    return;
  }

  const drive = getDriveClient();
  const folderId = FOLDER_ID as string;

  // ── Resume from checkpoint if previous run timed out ──────────────────────
  let pageToken: string | null | undefined;
  let resumeAtIndex = -1;

  if (channel.pendingPageToken) {
    pageToken = channel.pendingPageToken;
    resumeAtIndex = channel.pendingChangeIndex ?? -1;
    console.log(
      `[drive/processChanges] label=${label} Resuming from checkpoint — ` +
      `pendingPageToken=...${pageToken.slice(-8)} resumeAtIndex=${resumeAtIndex}`
    );
  } else {
    pageToken = channel.pageToken;
    console.log(
      `[drive/processChanges] label=${label} Fresh start — pageToken=...${pageToken.slice(-8)}`
    );
  }

  // ── Parent folder cache ────────────────────────────────────────────────────
  const parentCache = new Map<string, boolean>();

  async function isFolderInWatched(
    folderId_: string,
    visited = new Set<string>(),
    depth = 0
  ): Promise<boolean> {
    if (depth > 20) return false;
    if (folderId_ === folderId) return true;
    if (visited.has(folderId_)) return false;
    if (parentCache.has(folderId_)) return parentCache.get(folderId_)!;
    visited.add(folderId_);
    try {
      const res = await withDriveRetry(
        () => drive.files.get({ fileId: folderId_, fields: "parents" }),
        "isFolderInWatched"
      );
      const parents: string[] = res.data.parents ?? [];
      if (parents.length === 0) { parentCache.set(folderId_, false); return false; }
      for (const p of parents) {
        if (await isFolderInWatched(p, visited)) { parentCache.set(folderId_, true); return true; }
      }
      parentCache.set(folderId_, false);
      return false;
    } catch {
      parentCache.set(folderId_, false);
      return false;
    }
  }

  async function isInWatchedFolder(fileParents: string[]): Promise<boolean> {
    for (const parentId of fileParents) {
      if (await isFolderInWatched(parentId)) return true;
    }
    return false;
  }

  // ── modifiedTime map size — tracked locally to avoid a DB read per change ──
  // We hold the lock, so we're the only writer. Initialise from the hydrated
  // channel doc (Map on a non-lean doc has a .size property).
  let localMapSize = channel.lastModifiedTime?.size ?? 0;

  // ── Pagination loop ────────────────────────────────────────────────────────
  let totalProcessed = 0;
  let pagesProcessed = 0;
  let isFirstPage = true;

  while (pageToken) {
    const elapsed = Date.now() - fnStart;
    if (elapsed > EXECUTION_BUDGET_MS) {
      console.log(
        `[drive/processChanges] label=${label} ⏱ Budget exhausted at ${elapsed}ms. ` +
        `Checkpoint saved — next ping will resume.`
      );
      break;
    }

    const tPage = Date.now();
    pagesProcessed++;

    const changesRes: GaxiosResponseWithHTTP2<drive_v3.Schema$ChangeList> =
      await withDriveRetry(
        () => drive.changes.list({
          pageToken: pageToken ?? undefined,
          pageSize: 100,
          fields:
            "nextPageToken, newStartPageToken, " +
            "changes(fileId, removed, file(id, name, mimeType, parents, trashed, md5Checksum, modifiedTime))",
          includeRemoved: true,
          spaces: "drive",
        }),
        `processChanges page ${pagesProcessed}`
      );

    const changes = changesRes.data.changes ?? [];
    console.log(
      `[drive/processChanges] label=${label} Page ${pagesProcessed}: ` +
      `${changes.length} change(s) fetched in ${elapsedMs(tPage)}`
    );

    // ── Checkpoint BEFORE touching any changes ─────────────────────────────
    const nextPageToken = changesRes.data.nextPageToken;
    if (isFirstPage || !channel.pendingPageToken) {
      await DriveChannel.findByIdAndUpdate("main", {
        pendingPageToken: pageToken,
        pendingChangeIndex: -1,
      });
    }
    isFirstPage = false;

    // ── Process each change ────────────────────────────────────────────────
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      if (i <= resumeAtIndex) {
        console.log(`[drive/processChanges] label=${label}   skip index=${i} (already processed)`);
        continue;
      }

      if (!change.fileId) continue;

      await DriveChannel.findByIdAndUpdate("main", { pendingChangeIndex: i });

      const tChange = Date.now();
      const { fileId, file } = change;
      const mimeType = file?.mimeType ?? "";
      const parents = file?.parents ?? [];
      const fileName = file?.name;

      // ── Deletion ──────────────────────────────────────────────────────────
      if (change.removed || file?.trashed) {
        const isWatched = parents.length > 0 ? await isInWatchedFolder(parents) : false;
        if (isWatched) {
          try {
            await processDeletedFile(fileId, fileName, mimeType);
            totalProcessed++;
          } catch (err) {
            console.error(
              `[drive/processChanges] label=${label} Delete handler failed fileId=${fileId}:`,
              err instanceof Error ? err.message : err
            );
          }
        }

        // Clear the modifiedTime guard for this file.
        // If the file is later restored, Drive sends the same modifiedTime it
        // had before deletion — without this $unset the guard would see
        // lastSeen === modifiedTime and silently skip the restoration.
        await DriveChannel.findByIdAndUpdate("main", {
          $unset: { [`lastModifiedTime.${fileId}`]: "" },
        }).catch((e) =>
          console.warn(`[drive/processChanges] Failed to clear lastModifiedTime for ${fileId}:`, e)
        );

        console.log(
          `[drive/processChanges] label=${label}   [${i}] delete ` +
          `"${fileName ?? fileId}" watched=${isWatched} ${elapsedMs(tChange)}`
        );
        continue;
      }

      if (!file) continue;

      // ── modifiedTime guard ─────────────────────────────────────────────────
      const modifiedTime = file?.modifiedTime ?? null;
      if (modifiedTime) {
        const lastSeen = channel.lastModifiedTime?.get(fileId);
        if (lastSeen === modifiedTime) {
          console.log(
            `[drive/processChanges] label=${label}   [${i}] skip "${file?.name}" — modifiedTime unchanged`
          );
          continue;
        }
      }

      // ── Folder / sheet check ───────────────────────────────────────────────
      const tFolder = Date.now();
      const isInFolder = await isInWatchedFolder(parents);
      const folderCheckMs = Date.now() - tFolder;
      const isFMSSheet = mimeType === GOOGLE_SHEET_MIME && !!SHEET_ID && fileId === SHEET_ID;

      if (!isInFolder && !isFMSSheet) continue;

      try {
        if (isInFolder && IMAGE_MIME_TYPES.has(mimeType)) {
          await processImageFile(fileId, file);
          totalProcessed++;
          // Park in ImageIndex if no Catalog row has imageUrl for this file.
          // Runs after processImageFile (even if it partially failed) in its own
          // try/catch so a Backblaze error above doesn't prevent parking.
          try {
            await maybeIndexNewImage(
              fileId,
              file.name ?? "",
              mimeType,
              parents?.[0] ?? FOLDER_ID ?? ""
            );
          } catch (idxErr) {
            // Non-fatal — worst case: image isn't parked, recovered on next notification.
            console.error(`[drive/processChanges] maybeIndexNewImage failed for ${fileName}:`, idxErr);
          }
          console.log(
            `[drive/processChanges] label=${label}   [${i}] image "${fileName}" ` +
            `folderCheck=${folderCheckMs}ms total=${elapsedMs(tChange)}`
          );

        } else if (isInFolder && EXCEL_MIME_TYPES.has(mimeType)) {
          const result = await processExcelFile(fileId, file.name ?? "upload.xlsx");
          totalProcessed++;
          console.log(
            `[drive/processChanges] label=${label}   [${i}] excel "${fileName}" ` +
            `ins=${result.upserted} upd=${result.modified} skip=${result.skipped} ` +
            `folderCheck=${folderCheckMs}ms total=${elapsedMs(tChange)}`
          );
          if (result.errors.length > 0) {
            console.warn(
              `[drive/processChanges] label=${label} Excel ${fileName} had ` +
              `${result.errors.length} row error(s):`,
              result.errors.slice(0, 5)
            );
          }

        } else if (isFMSSheet) {
          await processCustomerSheet(fileId);
          totalProcessed++;
          console.log(
            `[drive/processChanges] label=${label}   [${i}] sheet "${fileName}" ` +
            `total=${elapsedMs(tChange)}`
          );
        } else {
          continue;
        }

        if (modifiedTime) {
          if (localMapSize < 50_000) {
            await DriveChannel.findByIdAndUpdate("main", {
              $set: { [`lastModifiedTime.${fileId}`]: modifiedTime },
            });
            localMapSize++;
          } else {
            console.warn(`[drive/processChanges] lastModifiedTime map at ${localMapSize} entries — skipping guard for ${fileId}`);
          }
        }

      } catch (err) {
        console.error(
          `[drive/processChanges] label=${label} ⚠ SKIPPED_ERROR [${i}] fileId=${fileId} ` +
          `name="${file.name}" mimeType=${mimeType} — manual review required:`,
          err
        );
      }
    }

    resumeAtIndex = -1;

    // ── Advance token ──────────────────────────────────────────────────────
    if (nextPageToken) {
      pageToken = nextPageToken;
      await DriveChannel.findByIdAndUpdate("main", {
        pageToken,
        $unset: { pendingPageToken: "", pendingChangeIndex: "" },
      });
    } else {
      const newToken = changesRes.data.newStartPageToken;
      if (newToken) {
        await DriveChannel.findByIdAndUpdate("main", {
          pageToken: newToken,
          $unset: { pendingPageToken: "", pendingChangeIndex: "" },
        });
        console.log(
          `[drive/processChanges] label=${label} Fully caught up. ` +
          `newStartPageToken=...${newToken.slice(-8)}`
        );
      }
      pageToken = null;
    }
  }

  console.log(
    `[drive/processChanges] label=${label} ■ DONE — ` +
    `${totalProcessed} file(s) across ${pagesProcessed} page(s) in ${elapsedMs(fnStart)}`
  );
}
