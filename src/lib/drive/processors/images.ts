import path from "path";
import { getDriveClient } from "@/lib/drive/client";
import { uploadBufferToBackblaze, getContentType } from "@/lib/backblaze";
import Catalog, { CATALOG_COLLATION } from "@/models/Catalog";
import { deleteFromImageIndex, upsertImageIndex } from "@/lib/drive/imageIndex";
import { withDriveRetry } from "@/lib/drive/retry";
import { drive_v3 } from "googleapis";

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT ?? "";

export async function processImageFile(
  fileId: string,
  file: drive_v3.Schema$File
): Promise<void> {
  const { name: fileName, mimeType, md5Checksum } = file;
  if (!fileName || !mimeType || !IMAGE_MIME_TYPES.has(mimeType)) return;

  const designNumber = path.basename(fileName, path.extname(fileName)).trim();

  // MD5 is required for idempotent image synchronization.
  // Google provides md5Checksum for binary files stored in Drive.
  // If it is unavailable, fail safely rather than risking a duplicate upload.
  if (!md5Checksum) {
    throw new Error(`Missing md5Checksum for image ${fileName}. Failing safely for retry.`);
  }

  // Idempotency check: have we already processed this exact file version?
  // Uses collation index (strength 2) — no regex, index-backed case-insensitive equality.
  const alreadyExists = await Catalog.exists({
    $or: [
      { designNumber: designNumber },
      { imageName:    fileName     },
    ],
    imageMd5: md5Checksum,
  }).collation(CATALOG_COLLATION);

  if (alreadyExists) {
    console.log(`[drive/images] ${fileName} → Skipped ✓ | (MD5 match, already uploaded)`);
    return;
  }

  // Secondary guard: imageUrl already set but imageMd5 is missing.
  // This happens when the Excel fallback uploaded the image (it doesn't fetch
  // the Drive md5Checksum, so it can't set imageMd5). Without this check,
  // processImageFile would re-upload to B2 on every Drive notification,
  // creating duplicate B2 objects and wasting storage cost.
  // Fix: stamp imageMd5 only and return — no re-upload.
  const alreadyHasUrl = await Catalog.exists({
    $or: [
      { designNumber: designNumber },
      { imageName:    fileName     },
    ],
    imageUrl: { $exists: true, $nin: [null, ""] },
  }).collation(CATALOG_COLLATION);

  if (alreadyHasUrl) {
    await Catalog.updateMany(
      { $or: [{ designNumber }, { imageName: fileName }] },
      { $set: { imageMd5: md5Checksum } }
    ).collation(CATALOG_COLLATION);
    await deleteFromImageIndex(fileId);
    console.log(`[drive/images] ${fileName} → imageUrl already set (Excel fallback) — stamped imageMd5, skipping re-upload`);
    return;
  }

  // Guard: if NO Catalog row references this design at all, skip the B2 upload.
  // The image arrived before the Excel was imported — park it in ImageIndex instead
  // (handled by maybeIndexNewImage after this function returns) and let the Excel
  // fallback download + upload when the SKU actually exists.
  // Without this guard, the same image would be uploaded to B2 twice:
  //   once here (with nothing in Catalog to point to it) and once by the Excel fallback.
  const hasCatalogRow = await Catalog.exists({
    $or: [
      { designNumber: designNumber },
      { imageName:    fileName     },
    ],
  }).collation(CATALOG_COLLATION);

  if (!hasCatalogRow) {
    console.log(`[drive/images] ${fileName} → No Catalog row yet — deferring to ImageIndex`);
    return; // maybeIndexNewImage will park it
  }

  const drive = getDriveClient();

  const downloadRes = await withDriveRetry(
    () => drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
    `drive/images ${fileName}`
  );
  const buffer      = Buffer.from(downloadRes.data as ArrayBuffer);
  const contentType = getContentType(fileName);

  const { key: objectKey } = await uploadBufferToBackblaze(
    buffer,
    fileName,
    contentType
  );

  const imageUrl = `${IMAGEKIT_URL_ENDPOINT.replace(/\/$/, "")}/${objectKey}`;

  // md5Checksum is guaranteed non-null here — we throw at line 30 if it's missing.
  const updateFields = {
    imageUrl,
    storageProvider: "backblaze",
    storagePath:     objectKey,
    imageName:       fileName,
    imageMd5:        md5Checksum,
  };

  // Match on both designNumber AND imageName (without extension).
  // Case-insensitive via collation index — no regex needed.
  const result = await Catalog.updateMany(
    {
      $or: [
        { imageName:    fileName     },
        { designNumber: designNumber },
      ],
    },
    { $set: updateFields }
  ).collation(CATALOG_COLLATION);

  // Image is now in Backblaze + Catalog — remove from gap index (if present).
  // Safe to call even if the file was never in ImageIndex.
  await deleteFromImageIndex(fileId);

  console.log(
    `[drive/images] ${fileName} → Backblaze ✓ | Updated ${result.modifiedCount} catalog item(s)`
  );
}

/**
 * Called by the webhook when a NEW image appears in Drive.
 * If it doesn't match any Catalog row yet, park it in ImageIndex
 * so the Excel processor can find it when that SKU is imported later.
 */
export async function maybeIndexNewImage(
  fileId:         string,
  fileName:       string,
  mimeType:       string,
  parentFolderId: string,
): Promise<void> {
  // If Catalog already has an imageUrl for this imageName, the gap is resolved.
  // processImageFile() already handled the upload — no need to park in ImageIndex.
  // Uses collation index — no regex, index-backed case-insensitive equality.
  const hasUrl = await Catalog.exists({
    imageName: fileName,
    imageUrl:  { $exists: true, $nin: [null, ""] },
  }).collation(CATALOG_COLLATION);

  if (hasUrl) {
    return;
  }

  // No Catalog row for this image yet — park it so Excel can find it later.
  await upsertImageIndex({ fileId, imageName: fileName, mimeType, parentFolderId });
  console.log(`[drive/images] ${fileName} → parked in ImageIndex (no Catalog row yet)`);
}
