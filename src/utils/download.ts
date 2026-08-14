/**
 * utils/download.ts — DOM-level blob download helper
 *
 * Separated from api-client.ts because:
 * - Downloading is a UI concern, not a networking concern.
 * - api-client.ts must remain free of DOM/browser APIs.
 */

/**
 * Triggers a browser file download for a given Blob.
 *
 * @param blob     - The blob to download (PDF, CSV, image, etc.)
 * @param filename - The suggested filename (e.g. "quotation-Q-001.pdf")
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;

  // Required for Firefox
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Release memory after a short delay to ensure the download begins
  setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
}
