import ImageKit from "imagekit";

if (
  !process.env.IMAGEKIT_PUBLIC_KEY ||
  !process.env.IMAGEKIT_PRIVATE_KEY ||
  !process.env.IMAGEKIT_URL_ENDPOINT
) {
  throw new Error(
    "Missing ImageKit env vars. Check IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT in .env.local"
  );
}

export const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// Base folder — everything goes inside here, never the root.
// Later you can pass "catalog/instock" or "catalog/processed" etc.
export const DEFAULT_UPLOAD_FOLDER = "catalog";

export interface ImageKitUploadResult {
  url: string;
  fileId: string;
  name: string;
}

/**
 * Uploads a single file buffer to ImageKit inside a given folder.
 * Returns only the fields we care about for MongoDB.
 */
export async function uploadToImageKit(
  fileBuffer: Buffer,
  fileName: string,
  folder: string = DEFAULT_UPLOAD_FOLDER
): Promise<ImageKitUploadResult> {
  const response = await imagekit.upload({
    file: fileBuffer,
    fileName,
    folder: `/${folder}`,
    useUniqueFileName: false, // keep imageName as the actual file name in ImageKit
  });

  return {
    url: response.url,
    fileId: response.fileId,
    name: response.name,
  };
}

/**
 * Optional helper if you ever need to delete a file (e.g. re-running after a bad upload).
 */
export async function deleteFromImageKit(fileId: string): Promise<void> {
  await imagekit.deleteFile(fileId);
}