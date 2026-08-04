import path from "path";
import { getDriveClient } from "@/lib/drive/client";
import { uploadBufferToBackblaze, getContentType } from "@/lib/backblaze";
import Catalog from "@/models/Catalog";
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
  const escapedDesignNumber = designNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadyExists = await Catalog.exists({
    designNumber: { $regex: new RegExp(`^${escapedDesignNumber}$`, "i") },
    imageMd5: md5Checksum,
  });

  if (alreadyExists) {
    console.log(`[drive/images] ${fileName} → Skipped ✓ | (MD5 match, already uploaded)`);
    return;
  }

  const drive = getDriveClient();

  const downloadRes = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const buffer      = Buffer.from(downloadRes.data as ArrayBuffer);
  const contentType = getContentType(fileName);

  const { key: objectKey } = await uploadBufferToBackblaze(
    buffer,
    fileName,
    contentType
  );

  const imageUrl = `${IMAGEKIT_URL_ENDPOINT.replace(/\/$/, "")}/${objectKey}`;

  const updateFields: any = {
    imageUrl,
    storageProvider: "backblaze",
    storagePath:     objectKey,
    imageName:       fileName,
  };
  
  if (md5Checksum) {
    updateFields.imageMd5 = md5Checksum;
  }

  const result = await Catalog.updateMany(
    { designNumber: { $regex: new RegExp(`^${escapedDesignNumber}$`, "i") } },
    { $set: updateFields }
  );

  console.log(
    `[drive/images] ${fileName} → Backblaze ✓ | Updated ${result.modifiedCount} catalog item(s)`
  );
}
