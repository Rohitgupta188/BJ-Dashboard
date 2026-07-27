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
  const { name: fileName, mimeType } = file;
  if (!fileName || !mimeType || !IMAGE_MIME_TYPES.has(mimeType)) return;

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

  const designNumber = path.basename(fileName, path.extname(fileName)).trim();

  const result = await Catalog.updateMany(
    { designNumber: { $regex: new RegExp(`^${designNumber}$`, "i") } },
    {
      $set: {
        imageUrl,
        storageProvider: "backblaze",
        storagePath:     objectKey,
        imageName:       fileName,
      },
    }
  );

  console.log(
    `[drive/images] ${fileName} → Backblaze ✓ | Updated ${result.modifiedCount} catalog item(s)`
  );
}
