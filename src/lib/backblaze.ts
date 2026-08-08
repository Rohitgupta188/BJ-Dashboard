import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import path from "path";

// ─── B2 retry ─────────────────────────────────────────────────────────────────
// AWS SDK v3 surfaces transient errors via $metadata.httpStatusCode (not .status).
// B2 can return 429, 500, 503 transiently. Without retry, a single B2 hiccup
// causes the image to be skipped permanently until the next Drive notification.

async function withB2Retry<T>(
  fn:      () => Promise<T>,
  label?:  string,
  retries: number = 3,
): Promise<T> {
  let n = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode ?? err?.statusCode;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || n >= retries) throw err;
      const base  = Math.min(Math.pow(2, n) * 1_000, 32_000);
      const delay = base + Math.floor(Math.random() * 1_000);
      const tag   = label ? `[${label}] ` : "";
      console.warn(`${tag}B2 error (${status}) — retry ${n + 1}/${retries} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      n++;
    }
  }
}

// ─── Environment validation ───────────────────────────────────────────────────

const REQUIRED_ENV = [
  "B2_BUCKET_NAME",
  "B2_REGION",
  "B2_ENDPOINT",
  "B2_ACCESS_KEY_ID",
  "B2_SECRET_ACCESS_KEY",
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key} — required for Backblaze B2. Add it to .env.local.`);
  }
}

// ─── S3-compatible client (Backblaze B2) ─────────────────────────────────────

export const s3Client = new S3Client({
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  credentials: {
    accessKeyId: process.env.B2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.B2_SECRET_ACCESS_KEY as string,
  },
  // Required for Backblaze's S3-compatible API
  forcePathStyle: true,
});

export const BUCKET_NAME = process.env.B2_BUCKET_NAME as string;
export const DEFAULT_UPLOAD_FOLDER = "catalog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".gif":  "image/gif",
};

export function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if an object already exists in the bucket without downloading it.
 * Used by the batch script as an idempotency guard.
 */
export async function objectExistsInBucket(objectKey: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: objectKey }));
    return true;
  } catch (err: any) {
    // B2 returns 404 for missing objects
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Upload a raw Buffer or Uint8Array directly to Backblaze.
 * Used by the Drive webhook handler (no disk I/O needed on serverless).
 *
 * @param buffer      - File bytes
 * @param fileName    - Final filename stored in the bucket (e.g. "TRTP001.jpg")
 * @param contentType - MIME type (e.g. "image/jpeg")
 * @param folder      - Bucket folder prefix. Defaults to "catalog"
 * @returns           - The full object key stored in the bucket
 */
export async function uploadBufferToBackblaze(
  buffer: Buffer | Uint8Array,
  fileName: string,
  contentType: string,
  folder: string = DEFAULT_UPLOAD_FOLDER
): Promise<{ key: string }> {
  const objectKey = `${folder}/${fileName}`;

  await withB2Retry(
    () => s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
      })
    ),
    `B2 upload ${fileName}`
  );

  return { key: objectKey };
}

/**
 * Upload a local file from disk to Backblaze.
 * Used by the batch import scripts that run locally (not on Vercel).
 *
 * @param localFilePath - Absolute path to the file on disk
 * @param fileName      - Final filename stored in the bucket
 * @param folder        - Bucket folder prefix. Defaults to "catalog"
 */
export async function uploadToBackblaze(
  localFilePath: string,
  fileName: string,
  folder: string = DEFAULT_UPLOAD_FOLDER
): Promise<{ key: string }> {
  const { createReadStream } = await import("fs");
  const objectKey = `${folder}/${fileName}`;
  const fileStream = createReadStream(localFilePath);
  const contentType = getContentType(fileName);

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

export async function deleteFromBackblaze(objectKey: string): Promise<boolean> {
  try {
    await withB2Retry(
      () => s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectKey,
        })
      ),
      `B2 delete ${objectKey}`
    );
    return true;
  } catch (err: any) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}