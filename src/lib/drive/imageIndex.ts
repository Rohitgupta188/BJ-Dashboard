/**
 * lib/drive/imageIndex.ts
 *
 * Helper functions for the ImageIndex collection.
 * All callers (images.ts, delete.ts, excel.ts, sync script) go through here.
 *
 * Design rules:
 *  - upsertImageIndex: safe to call multiple times (idempotent)
 *  - deleteFromImageIndex: safe to call even if document doesn't exist
 *  - lookupByImageName: case-insensitive, returns null if not found
 *
 * Lifecycle:
 *  - Park unmatched images WITH their B2 URL so other apps can use them.
 *  - When the matching catalog record arrives, reuse the URL and delete the
 *    imageIndex document (but not the B2 object — the catalog still needs it).
 */

import ImageIndex from "@/models/ImageIndex";

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Create or update an ImageIndex record.
 *
 * Storage fields (backblazePath, imageUrl, imageMd5, uploadStatus) are only
 * written to MongoDB when explicitly provided. Callers that don't supply them
 * (e.g. maybeIndexNewImage) will not overwrite values set by an earlier upload.
 */
export async function upsertImageIndex(params: {
  fileId:         string;
  imageName:      string;
  mimeType:       string;
  parentFolderId: string;
  backblazePath?:  string;
  imageUrl?:       string;
  imageMd5?:       string;
  uploadStatus?:   string;
}): Promise<void> {
  const setFields: Record<string, unknown> = {
    imageName:      params.imageName,
    mimeType:       params.mimeType,
    parentFolderId: params.parentFolderId,
  };
  // Only include storage fields when explicitly provided — callers that don't
  // supply them must not overwrite values set by an earlier upload.
  if (params.backblazePath !== undefined) setFields.backblazePath = params.backblazePath;
  if (params.imageUrl !== undefined)      setFields.imageUrl      = params.imageUrl;
  if (params.imageMd5 !== undefined)      setFields.imageMd5      = params.imageMd5;
  if (params.uploadStatus !== undefined)  setFields.uploadStatus  = params.uploadStatus;

  try {
    await ImageIndex.findOneAndUpdate(
      { fileId: params.fileId },
      { $set: setFields },
      { upsert: true, returnDocument: "after" }
    );
  } catch (err: any) {
    // E11000: two concurrent invocations raced on the same fileId.
    // The unique index means only one insert wins — the other is a no-op.
    // Safe to swallow: the document exists with correct data after either path.
    if (err?.code === 11000) return;
    throw err;
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Remove a Drive file from the gap index.
 * Called when:
 *   - The image is matched to a catalog record (images.ts, excel.ts) — the
 *     B2 object is kept because the catalog record still references it.
 *   - The Drive file is deleted (delete.ts) — the source is gone.
 */
export async function deleteFromImageIndex(fileId: string): Promise<void> {
  await ImageIndex.deleteOne({ fileId });
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Find an ImageIndex entry by imageName, case-insensitively.
 * Uses the case-insensitive collation index on imageName.
 *
 * When multiple Drive files share the same filename, returns the most
 * recently updated record (updatedAt desc) to prefer the latest content.
 *
 * Excel processor uses this to find the Drive fileId for a given imageName
 * so it can download → upload → resolve the gap.
 */
export async function lookupByImageName(imageName: string): Promise<{
  fileId:         string;
  imageName:      string;
  mimeType:       string;
  parentFolderId: string;
  backblazePath:  string | null;
  imageUrl:       string | null;
  imageMd5:       string | null;
  uploadStatus:   string;
} | null> {
  const doc = await ImageIndex.findOne(
    { imageName },
    {
      fileId: 1, imageName: 1, mimeType: 1, parentFolderId: 1,
      backblazePath: 1, imageUrl: 1, imageMd5: 1, uploadStatus: 1,
    }
  )
    .collation({ locale: "en", strength: 2 })
    .sort({ updatedAt: -1 })
    .lean();

  if (!doc) return null;

  return {
    fileId:         doc.fileId,
    imageName:      doc.imageName,
    mimeType:       doc.mimeType,
    parentFolderId: doc.parentFolderId,
    backblazePath:  doc.backblazePath ?? null,
    imageUrl:       doc.imageUrl ?? null,
    imageMd5:       doc.imageMd5 ?? null,
    uploadStatus:   doc.uploadStatus ?? "PENDING",
  };
}
