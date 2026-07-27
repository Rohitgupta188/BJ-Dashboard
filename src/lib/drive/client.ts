import { google } from "googleapis";

function buildAuth() {
  const saKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKey) {
    try {
      const creds = JSON.parse(saKey);
      return new google.auth.JWT({
        email: creds.client_email,
        key:   creds.private_key,
        scopes: [
          "https://www.googleapis.com/auth/drive.readonly",
          "https://www.googleapis.com/auth/spreadsheets.readonly",
        ],
      });
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON.");
    }
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_KEY, " +
        "or both GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY."
    );
  }

  return new google.auth.JWT({
    email: clientEmail,
    key:   privateKey,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
  });
}

let _drive:  ReturnType<typeof google.drive>  | null = null;
let _sheets: ReturnType<typeof google.sheets> | null = null;

export function getDriveClient() {
  if (!_drive) _drive = google.drive({ version: "v3", auth: buildAuth() });
  return _drive;
}

export function getSheetsClient() {
  if (!_sheets) _sheets = google.sheets({ version: "v4", auth: buildAuth() });
  return _sheets;
}
