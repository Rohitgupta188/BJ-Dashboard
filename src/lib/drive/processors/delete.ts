import path from "path";
import Catalog, { CATALOG_COLLATION } from "@/models/Catalog";
import { deleteFromBackblaze } from "@/lib/backblaze";
import { IMAGE_MIME_TYPES } from "./images";
import { deleteFromImageIndex } from "@/lib/drive/imageIndex";
import { EXCEL_MIME_TYPES } from "../constants";

export interface DeleteResult {
  handled: boolean;
  message: string;
  b2Deleted?: boolean;
  dbUpdated?: number;
}

export async function processDeletedFile(
  fileId: string,
  fileName: string | undefined | null,
  mimeType: string | undefined | null
): Promise<DeleteResult> {
  const mime = mimeType ?? "";
  const name = fileName ?? "";

  if (EXCEL_MIME_TYPES.has(mime)) {
    const deleteResult = await Catalog.updateMany(
      { driveFileId: fileId },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedReason: "drive_file_deleted" } }
    );

    const msg =
      `[drive/delete] Excel "${name || fileId}" removed from Drive — ` +
      `deleted ${deleteResult.modifiedCount} catalog record(s) from DB`;
    console.log(msg);

    return {
      handled: true,
      message: msg,
      dbUpdated: deleteResult.modifiedCount,
    };
  }

  if (IMAGE_MIME_TYPES.has(mime)) {
    // Match by BOTH imageName (filename with extension) AND designNumber (without extension).
    // processImageFile uploads using $or on both fields — delete must mirror that exactly,
    // otherwise rows matched by designNumber during upload are missed here.
    const designNumber = path.basename(name, path.extname(name)).trim();
    const imageFilter  = {
      $or: [
        { imageName:    name         },
        { designNumber: designNumber },
      ],
    };

    const docs = await Catalog.find(
      imageFilter,
      { storagePath: 1, imageName: 1 }
    ).collation(CATALOG_COLLATION).lean();

    let b2Deleted = false;

    // Collect unique B2 object keys across all matching Catalog docs and delete them.
    const uniquePaths = [...new Set(docs.map((d) => d.storagePath).filter(Boolean))];
    for (const objectKey of uniquePaths) {
      try {
        const deleted = await deleteFromBackblaze(objectKey);
        if (deleted) b2Deleted = true;
        console.log(
          `[drive/delete] B2 object "${objectKey}" ${deleted ? "deleted ✓" : "already absent"}`
        );
      } catch (err) {
        console.error(`[drive/delete] Failed to delete B2 object "${objectKey}":`, err);
      }
    }

    const dbResult = await Catalog.updateMany(
      imageFilter,
      {
        // Clear ONLY storage fields — imageName is product data from Excel, never touch it.
        // imageMd5 MUST be cleared: if the same image is re-uploaded with identical pixels,
        // processImageFile would see imageMd5 match and skip the upload — but imageUrl is
        // now empty, leaving the Catalog item permanently broken with no image.
        $unset: {
          imageUrl:        "",
          storagePath:     "",
          storageProvider: "",
          imageMd5:        "",
        },
      }
    ).collation(CATALOG_COLLATION);

    // Also remove from ImageIndex — file no longer exists in Drive.
    await deleteFromImageIndex(fileId);

    const msg =
      `[drive/delete] Image "${name}" deleted — ` +
      `B2 removed: ${b2Deleted}, Catalog docs cleared: ${dbResult.modifiedCount}`;
    console.log(msg);

    return {
      handled: true,
      message: msg,
      b2Deleted,
      dbUpdated: dbResult.modifiedCount,
    };
  }

  const msg = `[drive/delete] Ignored deletion of unsupported type "${mime}" (${name || fileId})`;
  // Only log if it actually had a mime type (Google Drive sends empty mime types for permanently expunged files)
  if (mime) {
    console.log(msg);
  }
  return { handled: false, message: msg };
}
