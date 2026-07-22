/**
 * lib/backblaze.ts
 *
 * Backblaze B2 storage helper, accessed via its S3-compatible API.
 * The bucket is PRIVATE — ImageKit is configured with these same B2
 * credentials on ImageKit's side and acts as the only thing that ever
 * reads from the bucket directly. The browser never sees a Backblaze URL.
 *
 * Required .env.local vars:
 *   B2_BUCKET_NAME       - e.g. brahammand-jewels-images
 *   B2_REGION            - e.g. eu-central-003
 *   B2_ENDPOINT          - e.g. https://s3.eu-central-003.backblazeb2.com
 *   B2_ACCESS_KEY_ID     - Application Key ID
 *   B2_SECRET_ACCESS_KEY - Application Key (secret)
 *
 * NOTE: No B2_PUBLIC_URL_BASE — the bucket stays private. Public-facing
 * URLs are built from IMAGEKIT_URL_ENDPOINT in scripts/upload-images.ts,
 * not from anything in this file.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const REQUIRED_ENV = [
  "B2_BUCKET_NAME",
  "B2_REGION",
  "B2_ENDPOINT",
  "B2_ACCESS_KEY_ID",
  "B2_SECRET_ACCESS_KEY",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key} in .env.local — required for Backblaze B2 uploads.`);
  }
}

export const s3Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY as string,
  },
  // Required for B2's S3-compatible API — virtual-hosted-style URLs don't work here.
  forcePathStyle: true,
});

console.log({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  bucket: process.env.B2_BUCKET_NAME,
});

export const BUCKET_NAME = process.env.B2_BUCKET_NAME as string;
export const DEFAULT_UPLOAD_FOLDER = "catalog";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
}

/**
 * Checks whether an object already exists in the bucket.
 * Used as a safety net: if a prior run uploaded the file but crashed
 * before updating MongoDB, we detect it here and skip re-uploading.
 */
export async function objectExistsInBucket(objectKey: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: objectKey }));
    return true;
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Any other error (auth, network, etc.) should surface, not be swallowed as "doesn't exist".
    throw err;
  }
}

/**
 * Uploads a single local file to the private Backblaze B2 bucket via
 * streaming (memory-efficient for large batches). Returns only the object
 * key — there is no public Backblaze URL by design; ImageKit is what
 * actually serves the file to the browser.
 */
export async function uploadToBackblaze(
  localFilePath: string,
  fileName: string,
  folder: string = DEFAULT_UPLOAD_FOLDER
): Promise<{ key: string }> {
  const objectKey = `${folder}/${fileName}`;
  const fileStream = fs.createReadStream(localFilePath);
  const contentType = getContentType(localFilePath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      Body: fileStream,
      ContentType: contentType,
    })
  );

  return { key: objectKey };
}