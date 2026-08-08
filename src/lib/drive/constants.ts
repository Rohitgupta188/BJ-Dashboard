/**
 * lib/drive/constants.ts
 *
 * Shared Google Drive MIME type constants.
 * Centralised here so future changes only need one edit.
 */

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
