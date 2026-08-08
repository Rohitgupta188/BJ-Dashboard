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
 */

import ImageIndex from "@/models/ImageIndex";

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertImageIndex(params: {
  fileId:         string;
  imageName:      string;
  mimeType:       string;
  parentFolderId: string;
}): Promise<void> {
  try {
    await ImageIndex.findOneAndUpdate(
      { fileId: params.fileId },
      {
        $set: {
          imageName:      params.imageName,
          mimeType:       params.mimeType,
          parentFolderId: params.parentFolderId,
        },
      },
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
 * Called after the image is successfully uploaded to Backblaze (images.ts)
 * or when the Drive file is deleted (delete.ts).
 */
export async function deleteFromImageIndex(fileId: string): Promise<void> {
  await ImageIndex.deleteOne({ fileId });
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Find an ImageIndex entry by imageName, case-insensitively.
 * Uses the case-insensitive collation index on imageName.
 *
 * Excel processor uses this to find the Drive fileId for a given imageName
 * so it can download → upload → resolve the gap.
 */
export async function lookupByImageName(imageName: string): Promise<{
  fileId:         string;
  imageName:      string;
  mimeType:       string;
  parentFolderId: string;
} | null> {
  const doc = await ImageIndex.findOne(
    { imageName },
    { fileId: 1, imageName: 1, mimeType: 1, parentFolderId: 1 }
  )
    .collation({ locale: "en", strength: 2 })
    .lean();

  if (!doc) return null;

  return {
    fileId:         doc.fileId,
    imageName:      doc.imageName,
    mimeType:       doc.mimeType,
    parentFolderId: doc.parentFolderId,
  };
}
