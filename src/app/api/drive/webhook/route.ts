import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { getDriveClient } from "@/lib/drive/client";
import { connectToDatabase } from "@/lib/db";
import DriveChannel from "@/models/DriveChannel";
import { IMAGE_MIME_TYPES, processImageFile } from "@/lib/drive/processors/images";
import { processExcelFile } from "@/lib/drive/processors/excel";
import { processCustomerSheet } from "@/lib/drive/processors/sheets";
import { GaxiosResponseWithHTTP2 } from "googleapis-common";
import { drive_v3 } from "googleapis";

const WEBHOOK_SECRET =
  process.env.GOOGLE_WEBHOOK_SECRET ?? process.env.DRIVE_WEBHOOK_CHANNEL_TOKEN;

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const SHEET_ID  = process.env.GOOGLE_SHEET_ID;

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

async function processChanges(): Promise<void> {
  if (!FOLDER_ID) {
    throw new Error("[drive/webhook] GOOGLE_DRIVE_FOLDER_ID env var is not set");
  }

  await connectToDatabase();
  const drive = getDriveClient();

  const channel = await DriveChannel.findById("main");
  if (!channel?.pageToken) {
    console.warn(
      "[drive/webhook] No DriveChannel document found in MongoDB. " +
      "Run `npm run register:webhook` to initialise the channel."
    );
    return;
  }

  const folderId = FOLDER_ID;
  let pageToken: string | null | undefined = channel.pageToken;
  let totalProcessed = 0;

  while (pageToken) {
    const changesRes: GaxiosResponseWithHTTP2<drive_v3.Schema$ChangeList> =
      await drive.changes.list({
        pageToken,
        fields:
          "nextPageToken, newStartPageToken, " +
          "changes(fileId, removed, file(id, name, mimeType, parents, trashed))",
        includeRemoved: true,
        spaces: "drive",
      });

    const changes = changesRes.data.changes ?? [];

    for (const change of changes) {
      // Skip deletions and trashed files
      if (change.removed || change.file?.trashed) continue;
      // Skip incomplete change objects
      if (!change.fileId || !change.file) continue;

      const { fileId, file } = change;
      const mimeType = file.mimeType ?? "";
      const parents  = file.parents  ?? [];

      const isInFolder = parents.includes(folderId);
      const isFMSSheet =
        mimeType === GOOGLE_SHEET_MIME && !!SHEET_ID && fileId === SHEET_ID;

      if (!isInFolder && !isFMSSheet) continue;

      try {
        if (isInFolder && IMAGE_MIME_TYPES.has(mimeType)) {
          await processImageFile(fileId, file);
          totalProcessed++;

        } else if (isInFolder && EXCEL_MIME_TYPES.has(mimeType)) {
          const result = await processExcelFile(fileId, file.name ?? "upload.xlsx");
          totalProcessed++;
          if (result.errors.length > 0) {
            console.warn(
              `[drive/webhook] Excel ${file.name} had ${result.errors.length} row error(s):`,
              result.errors.slice(0, 5)
            );
          }

        } else if (isFMSSheet) {
          await processCustomerSheet(fileId);
          totalProcessed++;
        }
      } catch (err) {
        console.error(
          `[drive/webhook] Failed to process fileId=${fileId} ` +
          `name="${file.name}" mimeType=${mimeType}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    if (changesRes.data.nextPageToken) {
      pageToken = changesRes.data.nextPageToken;
    } else {
      const newToken = changesRes.data.newStartPageToken;
      if (newToken) {
        await DriveChannel.findByIdAndUpdate("main", { pageToken: newToken });
        console.log(`[drive/webhook] pageToken advanced to ${newToken}`);
      }
      pageToken = null;
    }
  }

  console.log(`[drive/webhook] Batch complete — processed ${totalProcessed} file(s)`);
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const incomingToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");
  const channelId     = req.headers.get("x-goog-channel-id")     ?? "unknown";
  const resourceId    = req.headers.get("x-goog-resource-id")    ?? "unknown";
  const messageNumber = req.headers.get("x-goog-message-number") ?? "0";

  if (WEBHOOK_SECRET && incomingToken !== WEBHOOK_SECRET) {
    console.warn(
      `[drive/webhook] Rejected invalid token — ` +
      `channel=${channelId} resource=${resourceId}`
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  after(async () => {
    try {
      await processChanges();
    } catch (err) {
      console.error(
        `[drive/webhook] Fatal error in processChanges (msg#=${messageNumber}):`,
        err instanceof Error ? err.message : err
      );
    }
  });

  return NextResponse.json({ status: "ok", message: "processing" });
}
